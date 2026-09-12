import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { AiGatewayService } from './application/ai-gateway.js';
import { AuditService } from './application/audit-service.js';
import { AuthService, type AuthExtras } from './application/auth-service.js';
import { BlobService } from './application/blob-service.js';
import { CommentService } from './application/comment-service.js';
import { DocService } from './application/doc-service.js';
import { HealthService } from './application/health-service.js';
import { JiraService } from './application/jira-service.js';
import { MembershipService } from './application/membership-service.js';
import { DiscoveryOidcClient } from './application/oidc-client.js';
import { createArgon2Hasher } from './application/password-hasher.js';
import { SearchService } from './application/search-service.js';
import { SecurityPolicyService } from './application/security-policy-service.js';
import { ShareService } from './application/share-service.js';
import { SsoService } from './application/sso-service.js';
import { WebhookService } from './application/webhook-service.js';
import { WorkspaceService } from './application/workspace-service.js';
import { createBlobObjects } from './adapters/blobs/store.js';
import { authRoutes } from './adapters/http/auth-routes.js';
import { blobRoutes } from './adapters/http/blob-routes.js';
import { docRoutes } from './adapters/http/doc-routes.js';
import { registerErrorHandler } from './adapters/http/error-handler.js';
import './adapters/http/fastify-types.js';
import { graphqlPlugin } from './adapters/http/graphql-plugin.js';
import { healthRoutes } from './adapters/http/health-routes.js';
import { infoRoutes } from './adapters/http/info-routes.js';
import { metricsRoutes } from './adapters/http/metrics-routes.js';
import { observabilityPlugin } from './adapters/http/observability-plugin.js';
import { platformRoutes } from './adapters/http/platform-routes.js';
import { sessionPlugin } from './adapters/http/session-plugin.js';
import { setupRoutes } from './adapters/http/setup-routes.js';
import { staticPlugin } from './adapters/http/static-plugin.js';
import { createLogger } from './adapters/observability/logger.js';
import { createMetrics } from './adapters/observability/metrics.js';
import { TracingSkeleton } from './adapters/observability/tracing.js';
import { createStore } from './adapters/persistence/store.js';
import { socketPlugin } from './adapters/realtime/socket-plugin.js';
import { SocketRealtimeHub } from './adapters/realtime/hub.js';
import type { AppConfig } from './config/env.js';
import { errors } from './domain/errors.js';
import type { HttpFetcher } from './domain/ports.js';
import type { OauthProviderName } from './domain/sso.js';
import type { AiSettings } from './application/ai-gateway.js';
import type { JiraSettings } from './application/jira-service.js';
import type { OidcSettings } from './application/oidc-client.js';
import type { SamlSettings } from './application/sso-service.js';

export interface AppDeps {
  fetch?: HttpFetcher;
}

export async function buildApp(config: AppConfig, deps: AppDeps = {}) {
  const fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const logger = createLogger(config);
  const store = await createStore(config);
  const clock = { now: () => new Date() };
  const hasher = createArgon2Hasher();
  const audit = new AuditService(
    store,
    clock,
    fetch,
    config.MOSAIC_SIEM_WEBHOOK_URL,
    config.AUDIT_RETENTION_DAYS
  );
  const policy = new SecurityPolicyService(store, clock);
  const authExtras: AuthExtras = {
    audit,
    oauth: store,
    policy,
  };
  const auth = new AuthService(
    store,
    hasher,
    clock,
    {
      allowSignup: config.allowSignup,
      passwordMinLength: config.PASSWORD_MIN_LENGTH,
      passwordMaxLength: config.PASSWORD_MAX_LENGTH,
      idleTtlMs: config.SESSION_IDLE_MS,
      absoluteTtlMs: config.SESSION_ABSOLUTE_MS,
      accessTtlMs: config.ACCESS_TOKEN_MS,
      refreshTtlMs: config.REFRESH_TOKEN_MS,
      exchangeTtlMs: 2 * 60 * 1000,
    },
    authExtras
  );
  const oidcSettings: OidcSettings = {};
  if (config.MOSAIC_OIDC_ISSUER)
    oidcSettings.issuer = config.MOSAIC_OIDC_ISSUER;
  if (config.MOSAIC_OIDC_CLIENT_ID)
    oidcSettings.clientId = config.MOSAIC_OIDC_CLIENT_ID;
  if (config.MOSAIC_OIDC_CLIENT_SECRET)
    oidcSettings.clientSecret = config.MOSAIC_OIDC_CLIENT_SECRET;
  if (config.MOSAIC_OIDC_PROVIDER) {
    oidcSettings.providerLabel =
      config.MOSAIC_OIDC_PROVIDER as OauthProviderName;
  }
  const oidc = new DiscoveryOidcClient(oidcSettings, fetch);
  const saml: SamlSettings = {};
  if (config.MOSAIC_SAML_IDP_SSO_URL)
    saml.ssoUrl = config.MOSAIC_SAML_IDP_SSO_URL;
  if (config.MOSAIC_SAML_IDP_ENTITY_ID)
    saml.entityId = config.MOSAIC_SAML_IDP_ENTITY_ID;
  if (config.MOSAIC_SAML_CERTIFICATE)
    saml.certificate = config.MOSAIC_SAML_CERTIFICATE;
  const sso = new SsoService(auth, oidc, saml, config.MOSAIC_PUBLIC_URL, clock);
  authExtras.oauthProviders = () => sso.oauthProviders();
  const objects = createBlobObjects({
    ...(config.BLOB_DRIVER ? { driver: config.BLOB_DRIVER } : {}),
    dir: config.BLOB_DIR,
    nodeEnv: config.NODE_ENV,
  });
  const blobs = new BlobService(store, store, objects, clock, {
    maxBytes: config.BLOB_MAX_BYTES,
    storageQuota: config.BLOB_STORAGE_QUOTA_BYTES,
    multipartThreshold: config.BLOB_MULTIPART_THRESHOLD,
    partSize: config.BLOB_PART_SIZE,
    uploadTtlMs: config.BLOB_UPLOAD_TTL_MS,
  });
  const workspaces = new WorkspaceService(store, clock, blobs, audit);
  const ioBox: { current: import('socket.io').Server | undefined } = {
    current: undefined,
  };
  const hub = new SocketRealtimeHub(() => ioBox.current);
  const webhooks = new WebhookService(workspaces, store, clock, fetch, audit);
  const members = new MembershipService(
    workspaces,
    store,
    store,
    store,
    clock,
    config.MOSAIC_PUBLIC_URL,
    hub,
    { audit, policy, webhooks }
  );
  const shares = new ShareService(workspaces, store, store, clock, hub, {
    audit,
    policy,
    webhooks,
  });
  const comments = new CommentService(workspaces, store, store, clock, hub, {
    webhooks,
  });
  const docs = new DocService(store, store, clock, {
    compactUpdateCount: config.SYNC_COMPACT_UPDATES,
    maxUpdateBytes: config.SYNC_MAX_UPDATE_BYTES,
    historyLimit: config.DOC_HISTORY_LIMIT,
  });
  const search = new SearchService(store, store);
  const aiSettings: AiSettings = {
    baseUrl: config.MOSAIC_AI_BASE_URL,
    model: config.MOSAIC_AI_MODEL,
  };
  if (config.MOSAIC_AI_API_KEY) {
    aiSettings.apiKey = config.MOSAIC_AI_API_KEY;
  }
  const ai = new AiGatewayService(store, clock, aiSettings, fetch, audit);
  const jiraSettings: JiraSettings = {};
  if (config.MOSAIC_JIRA_BASE_URL)
    jiraSettings.baseUrl = config.MOSAIC_JIRA_BASE_URL;
  if (config.MOSAIC_JIRA_EMAIL) jiraSettings.email = config.MOSAIC_JIRA_EMAIL;
  if (config.MOSAIC_JIRA_API_TOKEN)
    jiraSettings.apiToken = config.MOSAIC_JIRA_API_TOKEN;
  const jira = new JiraService(jiraSettings, fetch);
  const health = new HealthService(config, store);

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: req => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && incoming.length > 0) {
        return incoming;
      }
      return randomUUID();
    },
  });

  const metrics = createMetrics(config.OTEL_SERVICE_NAME, {
    collectProcessMetrics: config.NODE_ENV !== 'test',
  });
  const tracing = new TracingSkeleton(
    config.OTEL_SERVICE_NAME,
    config.OTEL_EXPORTER_OTLP_ENDPOINT,
    (payload, msg) => {
      app.log.info(payload, msg);
    }
  );

  app.decorate('mosaicAuthRateLimit', config.RATE_LIMIT_AUTH_MAX);
  registerErrorHandler(app as unknown as import('fastify').FastifyInstance);

  await app.register(observabilityPlugin, { metrics, tracing });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? config.MOSAIC_PUBLIC_URL : true,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    allowList: request =>
      request.url === '/metrics' ||
      request.url.startsWith('/health/') ||
      request.url === '/info' ||
      request.url.startsWith('/socket.io'),
    errorResponseBuilder: () => errors.tooManyRequests(),
  });

  const cookies = {
    secure: config.cookieSecure,
    maxAgeSec: Math.floor(config.SESSION_ABSOLUTE_MS / 1000),
  };

  await app.register(sessionPlugin, { auth });
  await app.register(infoRoutes, { health });
  await app.register(healthRoutes, { health });
  await app.register(metricsRoutes, { metrics });
  await app.register(authRoutes, { auth, cookies, sso });
  await app.register(setupRoutes, { auth, cookies });
  await app.register(graphqlPlugin, {
    auth,
    workspaces,
    members,
    shares,
    comments,
    blobs,
    docs,
    sso,
    search,
    ai,
    audit,
    policy,
    config,
  });
  await app.register(docRoutes, { auth, docs, shares });
  await app.register(blobRoutes, { auth, blobs });
  await app.register(platformRoutes, {
    auth,
    workspaces,
    audit,
    webhooks,
    ai,
    jira,
    ...(config.MOSAIC_JIRA_WEBHOOK_SECRET
      ? { jiraWebhookSecret: config.MOSAIC_JIRA_WEBHOOK_SECRET }
      : {}),
  });
  await app.register(socketPlugin, {
    auth,
    docs,
    members,
    shares,
    comments,
    blobs,
    config,
    metrics,
  });
  ioBox.current = app.mosaicIo;

  if (config.MOSAIC_STATIC_DIR) {
    if (!existsSync(config.MOSAIC_STATIC_DIR)) {
      if (config.NODE_ENV === 'production') {
        throw new Error(
          `MOSAIC_STATIC_DIR does not exist: ${config.MOSAIC_STATIC_DIR}`
        );
      }
      app.log.warn(
        { dir: config.MOSAIC_STATIC_DIR },
        'mosaic_static_dir_missing'
      );
    } else {
      await app.register(staticPlugin, { dir: config.MOSAIC_STATIC_DIR });
    }
  }

  app.addHook('onClose', async () => {
    await objects.close();
    await store.close();
  });

  return {
    app,
    health,
    store,
    auth,
    workspaces,
    members,
    shares,
    comments,
    docs,
    blobs,
    sso,
    search,
    ai,
    audit,
    policy,
    webhooks,
    jira,
  };
}

export type BuiltApp = Awaited<ReturnType<typeof buildApp>>;
