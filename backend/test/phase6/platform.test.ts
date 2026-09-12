import { createHmac, generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { hmacSha256 } from '../../src/application/oidc-client.js';
import type { HttpFetcher } from '../../src/domain/ports.js';
import { startTestApp } from '../helpers/app.js';
import { cookieHeader } from '../helpers/cookies.js';

function signAssertion(assertionXml: string, privateKey: string): string {
  const sig = new SignedXml({
    privateKey,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
  });
  sig.computeSignature(assertionXml);
  return sig.getSignedXml();
}

const CREATE = `mutation createWorkspace { createWorkspace { id } }`;

const INVITE = `mutation inviteByEmails($workspaceId: String!, $emails: [String!]!) {
  inviteMembers(workspaceId: $workspaceId, emails: $emails) { email inviteId error }
}`;

const PUBLISH = `mutation publishPage($workspaceId: String!, $pageId: String!) {
  publishDoc(workspaceId: $workspaceId, docId: $pageId) { id public }
}`;

const SEARCH_DOCS = `query indexerSearchDocs($id: String!, $input: SearchDocsInput!) {
  workspace(id: $id) {
    searchDocs(input: $input) { docId title highlight }
  }
}`;

const SEARCH = `query indexerSearch($id: String!, $input: SearchInput!) {
  workspace(id: $id) {
    search(input: $input) {
      nodes { fields highlights }
      pagination { count hasMore nextCursor }
    }
  }
}`;

const POLICY = `mutation updateWorkspaceSecurityPolicy($workspaceId: String!, $input: SecurityPolicyInput!) {
  updateWorkspaceSecurityPolicy(workspaceId: $workspaceId, input: $input) {
    allowedGuestDomains
    blockPublicLinks
  }
}`;

const INSTANCE_POLICY = `mutation updateInstanceSecurityPolicy($input: SecurityPolicyInput!) {
  updateInstanceSecurityPolicy(input: $input) { requireSso requireSsoDomains }
}`;

const AUDIT = `query auditLogs($workspaceId: String) {
  auditLogs(workspaceId: $workspaceId) { action actorId workspaceId }
}`;

const COPILOT_QUOTA = `query copilotQuota {
  currentUser { copilot { quota { limit used } } }
}`;

const CREATE_SESSION = `mutation createCopilotSession($options: CreateChatSessionInput!) {
  createCopilotSession(options: $options)
}`;

const CREATE_MESSAGE = `mutation createCopilotMessage($options: CreateChatMessageInput!) {
  createCopilotMessage(options: $options)
}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jwtPayload(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' })
  ).toString('base64url');
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${data}.x`;
}

async function gql(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  query: string,
  opts?: { cookies?: string; variables?: Record<string, unknown> }
) {
  return app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      'x-operation-name': 'op',
      ...(opts?.cookies ? { cookie: opts.cookies } : {}),
    },
    payload: { query, variables: opts?.variables ?? {} },
  });
}

async function signIn(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  email: string,
  password = 'correcthorse'
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    headers: { 'content-type': 'application/json' },
    payload: { email, password },
  });
  return {
    res,
    cookies: cookieHeader(res),
    body: res.json() as { id: string; email: string },
  };
}

describe('Phase 6 — Product platform', () => {
  it('advertises Indexer always and Copilot/OAuth only when configured', async () => {
    const { app } = await startTestApp();
    const res = await gql(
      app,
      `query { serverConfig { features oauthProviders } }`
    );
    const body = res.json() as {
      data: { serverConfig: { features: string[]; oauthProviders: string[] } };
    };
    expect(body.data.serverConfig.features).toContain('Comment');
    expect(body.data.serverConfig.features).toContain('Indexer');
    expect(body.data.serverConfig.features).not.toContain('Copilot');
    expect(body.data.serverConfig.features).not.toContain('OAuth');
    expect(body.data.serverConfig.features).not.toContain('Payment');
    expect(body.data.serverConfig.oauthProviders).toEqual([]);
  });

  it('records an audit trail for workspace create and exports CSV for admins', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner@example.com');
    const created = await gql(app, CREATE, { cookies: owner.cookies });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;

    const logs = await gql(app, AUDIT, {
      cookies: owner.cookies,
      variables: { workspaceId },
    });
    const actions = (
      logs.json() as { data: { auditLogs: Array<{ action: string }> } }
    ).data.auditLogs.map(item => item.action);
    expect(actions).toContain('workspace.create');

    const csv = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs?format=csv',
      headers: { cookie: owner.cookies },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('workspace.create');
  });

  it('enforces guest-domain allowlist and blockPublicLinks', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner@example.com');
    const created = await gql(app, CREATE, { cookies: owner.cookies });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;

    await gql(app, POLICY, {
      cookies: owner.cookies,
      variables: {
        workspaceId,
        input: {
          allowedGuestDomains: ['partners.example'],
          blockPublicLinks: true,
        },
      },
    });

    const invited = await gql(app, INVITE, {
      cookies: owner.cookies,
      variables: { workspaceId, emails: ['outsider@evil.example'] },
    });
    const inviteBody = invited.json() as {
      data: { inviteMembers: Array<{ error: { name?: string } | null }> };
    };
    expect(inviteBody.data.inviteMembers[0]?.error?.name).toBe(
      'ACTION_FORBIDDEN'
    );

    const allowed = await gql(app, INVITE, {
      cookies: owner.cookies,
      variables: { workspaceId, emails: ['ok@partners.example'] },
    });
    const allowedBody = allowed.json() as {
      data: {
        inviteMembers: Array<{ inviteId: string | null; error: unknown }>;
      };
    };
    expect(allowedBody.data.inviteMembers[0]?.inviteId).toBeTruthy();
    expect(allowedBody.data.inviteMembers[0]?.error).toBeNull();

    const published = await gql(app, PUBLISH, {
      cookies: owner.cookies,
      variables: { workspaceId, pageId: 'doc-1' },
    });
    const pub = published.json() as {
      errors?: Array<{ extensions?: { name?: string } }>;
    };
    expect(pub.errors?.[0]?.extensions?.name).toBe('ACTION_FORBIDDEN');
  });

  it('completes an OIDC preflight/callback with mocked discovery and sets cookies', async () => {
    const fetch: HttpFetcher = async (url, init) => {
      const href = String(url);
      if (href.includes('openid-configuration')) {
        return jsonResponse({
          authorization_endpoint: 'https://idp.example/authorize',
          token_endpoint: 'https://idp.example/token',
          userinfo_endpoint: 'https://idp.example/userinfo',
        });
      }
      if (href.includes('/token')) {
        return jsonResponse({
          access_token: 'at',
          id_token: jwtPayload({
            sub: 'oidc-1',
            email: 'sso@example.com',
            name: 'SSO User',
          }),
        });
      }
      if (href.includes('/userinfo')) {
        return jsonResponse({
          sub: 'oidc-1',
          email: 'sso@example.com',
          name: 'SSO User',
        });
      }
      return jsonResponse({ ok: true }, init?.method === 'POST' ? 200 : 404);
    };

    const { app } = await startTestApp(
      {
        MOSAIC_OIDC_ISSUER: 'https://idp.example',
        MOSAIC_OIDC_CLIENT_ID: 'client',
        MOSAIC_OIDC_CLIENT_SECRET: 'secret',
        MOSAIC_OIDC_PROVIDER: 'OIDC',
      },
      { fetch }
    );

    const features = await gql(
      app,
      `query { serverConfig { features oauthProviders } }`
    );
    const cfg = features.json() as {
      data: { serverConfig: { features: string[]; oauthProviders: string[] } };
    };
    expect(cfg.data.serverConfig.features).toContain('OAuth');
    expect(cfg.data.serverConfig.oauthProviders).toEqual(['OIDC']);

    const preflight = await app.inject({
      method: 'POST',
      url: '/api/oauth/preflight',
      headers: { 'content-type': 'application/json' },
      payload: {
        provider: 'OIDC',
        client: 'web',
        redirect_uri: 'http://localhost:3010/workspace',
        client_nonce: 'nonce-1',
      },
    });
    expect(preflight.statusCode).toBe(200);
    const url = (preflight.json() as { url: string }).url;
    expect(url).toContain('https://idp.example/authorize');
    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await app.inject({
      method: 'POST',
      url: '/api/oauth/callback',
      headers: { 'content-type': 'application/json' },
      payload: { code: 'auth-code', state, client_nonce: 'nonce-1' },
    });
    expect(callback.statusCode).toBe(200);
    const body = callback.json() as {
      email: string;
      redirectUri: string;
      hasPassword: boolean;
    };
    expect(body.email).toBe('sso@example.com');
    expect(body.redirectUri).toBe('http://localhost:3010/workspace');
    expect(body.hasPassword).toBe(false);
    const cookies = cookieHeader(callback);
    expect(cookies).toContain('affine_session=');

    const me = await gql(app, `query { currentUser { email hasPassword } }`, {
      cookies,
    });
    expect(me.json()).toMatchObject({
      data: { currentUser: { email: 'sso@example.com', hasPassword: false } },
    });
  });

  it('rejects an OIDC id_token whose nonce does not match the one minted for the flow', async () => {
    // A replayed/substituted id_token carrying a nonce that doesn't match
    // the one minted for *this* authorization request must be rejected,
    // even though the token would otherwise decode to a "valid looking"
    // profile (protects against id_token substitution / replay attacks).
    const fetch: HttpFetcher = async (url, init) => {
      const href = String(url);
      if (href.includes('openid-configuration')) {
        return jsonResponse({
          authorization_endpoint: 'https://idp.example/authorize',
          token_endpoint: 'https://idp.example/token',
          userinfo_endpoint: 'https://idp.example/userinfo',
        });
      }
      if (href.includes('/token')) {
        return jsonResponse({
          access_token: 'at',
          id_token: jwtPayload({
            sub: 'oidc-1',
            email: 'sso@example.com',
            name: 'SSO User',
            nonce: 'replayed-nonce-does-not-match',
          }),
        });
      }
      return jsonResponse({ ok: true }, init?.method === 'POST' ? 200 : 404);
    };
    const { app } = await startTestApp(
      {
        MOSAIC_OIDC_ISSUER: 'https://idp.example',
        MOSAIC_OIDC_CLIENT_ID: 'client',
        MOSAIC_OIDC_CLIENT_SECRET: 'secret',
        MOSAIC_OIDC_PROVIDER: 'OIDC',
      },
      { fetch }
    );

    const preflight = await app.inject({
      method: 'POST',
      url: '/api/oauth/preflight',
      headers: { 'content-type': 'application/json' },
      payload: { provider: 'OIDC', client: 'web' },
    });
    const state = new URL(
      (preflight.json() as { url: string }).url
    ).searchParams.get('state');

    const callback = await app.inject({
      method: 'POST',
      url: '/api/oauth/callback',
      headers: { 'content-type': 'application/json' },
      payload: { code: 'auth-code', state },
    });
    expect(callback.statusCode).toBe(400);
  });

  it('accepts a crafted SAML ACS assertion and rejects unsigned when a cert is configured', async () => {
    const assertion =
      '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">' +
      '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">' +
      '<saml:Subject><saml:NameID>saml.user@example.com</saml:NameID></saml:Subject>' +
      '<saml:AttributeStatement><saml:Attribute Name="email">' +
      '<saml:AttributeValue>saml.user@example.com</saml:AttributeValue></saml:Attribute>' +
      '<saml:Attribute Name="displayName">' +
      '<saml:AttributeValue>Saml User</saml:AttributeValue></saml:Attribute>' +
      '</saml:AttributeStatement></saml:Assertion></samlp:Response>';
    const encoded = Buffer.from(assertion, 'utf8').toString('base64');

    const unsigned = await startTestApp({
      MOSAIC_SAML_IDP_SSO_URL: 'https://idp.example/sso',
      MOSAIC_SAML_IDP_ENTITY_ID: 'https://idp.example',
    });
    const metadata = await unsigned.app.inject({
      method: 'GET',
      url: '/api/auth/saml/metadata',
    });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.body).toContain('EntityDescriptor');

    const login = await unsigned.app.inject({
      method: 'GET',
      url: '/api/auth/saml/login',
    });
    expect(login.statusCode).toBe(302);
    expect(String(login.headers.location)).toContain('SAMLRequest=');

    const acs = await unsigned.app.inject({
      method: 'POST',
      url: '/api/auth/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `SAMLResponse=${encodeURIComponent(encoded)}`,
    });
    expect(acs.statusCode).toBe(302);
    expect(cookieHeader(acs)).toContain('affine_session=');

    const signedRequired = await startTestApp({
      MOSAIC_SAML_IDP_SSO_URL: 'https://idp.example/sso',
      MOSAIC_SAML_CERTIFICATE:
        '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    });
    const rejected = await signedRequired.app.inject({
      method: 'POST',
      url: '/api/auth/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `SAMLResponse=${encodeURIComponent(encoded)}`,
    });
    expect(rejected.statusCode).toBe(400);
  });

  it('verifies real XML-DSig signatures on SAML ACS and rejects forged / mismatched-key ones', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const assertionXml =
      '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_assertion123" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">' +
      '<saml:Subject><saml:NameID>signed.user@example.com</saml:NameID></saml:Subject>' +
      '<saml:AttributeStatement><saml:Attribute Name="email">' +
      '<saml:AttributeValue>signed.user@example.com</saml:AttributeValue></saml:Attribute>' +
      '<saml:Attribute Name="displayName">' +
      '<saml:AttributeValue>Signed User</saml:AttributeValue></saml:Attribute>' +
      '</saml:AttributeStatement></saml:Assertion>';
    const signedAssertion = signAssertion(assertionXml, privateKey);
    const response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">${signedAssertion}</samlp:Response>`;
    const encoded = Buffer.from(response, 'utf8').toString('base64');

    const { app } = await startTestApp({
      MOSAIC_SAML_IDP_SSO_URL: 'https://idp.example/sso',
      MOSAIC_SAML_CERTIFICATE: publicKey,
    });

    // Genuinely signed by the configured key pair: accepted, and the identity
    // is taken from the cryptographically verified content.
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/auth/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `SAMLResponse=${encodeURIComponent(encoded)}`,
    });
    expect(accepted.statusCode).toBe(302);
    expect(cookieHeader(accepted)).toContain('affine_session=');

    // A forged assertion carrying a `<Signature>` element that merely exists
    // as text but was produced with a *different* key pair must be rejected
    // (proves we cryptographically verify, not string-match "Signature").
    const forgedAssertion = signAssertion(assertionXml, other.privateKey);
    const forgedResponse = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">${forgedAssertion}</samlp:Response>`;
    const forgedEncoded = Buffer.from(forgedResponse, 'utf8').toString(
      'base64'
    );
    const rejectedForgery = await app.inject({
      method: 'POST',
      url: '/api/auth/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `SAMLResponse=${encodeURIComponent(forgedEncoded)}`,
    });
    expect(rejectedForgery.statusCode).toBe(400);

    // Tampering with the signed content after signing (e.g. swapping the
    // email in the NameID/Attribute) must also be rejected.
    const tamperedResponse = response.replace(
      /signed\.user@example\.com/g,
      'admin@example.com'
    );
    const tamperedEncoded = Buffer.from(tamperedResponse, 'utf8').toString(
      'base64'
    );
    const rejectedTamper = await app.inject({
      method: 'POST',
      url: '/api/auth/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `SAMLResponse=${encodeURIComponent(tamperedEncoded)}`,
    });
    expect(rejectedTamper.statusCode).toBe(400);
  });

  it('finds Yjs document text via workspace.searchDocs', async () => {
    const built = await startTestApp();
    const owner = await signIn(built.app, 'owner@example.com');
    const created = await gql(built.app, CREATE, { cookies: owner.cookies });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;
    const user = await built.store.findUserById(owner.body.id);
    expect(user).toBeTruthy();
    const doc = new YDoc();
    doc.getText('content').insert(0, 'hello mosaic search needle');
    await built.docs.push(user!, {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: 'board-1',
      update: encodeStateAsUpdate(doc),
    });

    const found = await gql(built.app, SEARCH_DOCS, {
      cookies: owner.cookies,
      variables: { id: workspaceId, input: { keyword: 'needle' } },
    });
    const hits = (
      found.json() as {
        data: {
          workspace: {
            searchDocs: Array<{ docId: string; highlight: string }>;
          };
        };
      }
    ).data.workspace.searchDocs;
    expect(hits.some(hit => hit.docId === 'board-1')).toBe(true);

    const structured = await gql(built.app, SEARCH, {
      cookies: owner.cookies,
      variables: {
        id: workspaceId,
        input: {
          table: 'doc',
          query: { type: 'match', match: 'mosaic' },
          options: { fields: ['docId', 'content'] },
        },
      },
    });
    const nodes = (
      structured.json() as {
        data: {
          workspace: {
            search: { pagination: { count: number }; nodes: unknown[] };
          };
        };
      }
    ).data.workspace.search;
    expect(nodes.pagination.count).toBeGreaterThan(0);
  });

  it('returns copilotDisabled without a key and chats when BYOK is mocked', async () => {
    const disabled = await startTestApp();
    const owner = await signIn(disabled.app, 'owner@example.com');
    const quota = await gql(disabled.app, COPILOT_QUOTA, {
      cookies: owner.cookies,
    });
    expect(quota.json()).toMatchObject({
      data: { currentUser: { copilot: { quota: { limit: 0 } } } },
    });
    const created = await gql(disabled.app, CREATE, { cookies: owner.cookies });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;
    const blocked = await gql(disabled.app, CREATE_SESSION, {
      cookies: owner.cookies,
      variables: { options: { workspaceId, promptName: 'debug' } },
    });
    expect(
      (blocked.json() as { errors?: Array<{ extensions?: { name?: string } }> })
        .errors?.[0]?.extensions?.name
    ).toBe('ACTION_FORBIDDEN');

    const fetch: HttpFetcher = async url => {
      if (String(url).includes('/chat/completions')) {
        return jsonResponse({
          choices: [{ message: { content: 'board ready' } }],
        });
      }
      return jsonResponse({}, 404);
    };
    const live = await startTestApp(
      {
        MOSAIC_AI_API_KEY: 'sk-test',
        MOSAIC_AI_BASE_URL: 'https://ai.example/v1',
      },
      { fetch }
    );
    const liveOwner = await signIn(live.app, 'ai@example.com');
    const liveWs = await gql(live.app, CREATE, { cookies: liveOwner.cookies });
    const liveId = (
      liveWs.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;
    const features = await gql(live.app, `query { serverConfig { features } }`);
    expect(
      (features.json() as { data: { serverConfig: { features: string[] } } })
        .data.serverConfig.features
    ).toContain('Copilot');

    const session = await gql(live.app, CREATE_SESSION, {
      cookies: liveOwner.cookies,
      variables: {
        options: {
          workspaceId: liveId,
          promptName: 'debug',
          reuseLatestChat: false,
        },
      },
    });
    const sessionId = (
      session.json() as { data: { createCopilotSession: string } }
    ).data.createCopilotSession;
    expect(sessionId).toBeTruthy();

    const message = await gql(live.app, CREATE_MESSAGE, {
      cookies: liveOwner.cookies,
      variables: { options: { sessionId, content: 'hello' } },
    });
    expect(
      (message.json() as { data: { createCopilotMessage: string } }).data
        .createCopilotMessage
    ).toBeTruthy();

    const kanban = await live.app.inject({
      method: 'POST',
      url: `/api/workspaces/${liveId}/ai/kanban`,
      headers: {
        'content-type': 'application/json',
        cookie: liveOwner.cookies,
      },
      payload: { prompt: 'plan the launch' },
    });
    expect(kanban.statusCode).toBe(200);
  });

  it('signs outbound webhooks with HMAC-SHA256', async () => {
    const delivered: Array<{ url: string; signature: string; body: string }> =
      [];
    const fetch: HttpFetcher = async (url, init) => {
      if (init?.method === 'POST' && String(url).includes('hooks.example')) {
        delivered.push({
          url: String(url),
          signature: String(
            (init.headers as Record<string, string>)['x-mosaic-signature'] ?? ''
          ),
          body: String(init.body ?? ''),
        });
        return jsonResponse({ ok: true });
      }
      return jsonResponse({}, 404);
    };
    const { app } = await startTestApp({}, { fetch });
    const owner = await signIn(app, 'owner@example.com');
    const created = await gql(app, CREATE, { cookies: owner.cookies });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;

    const createdHook = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/webhooks`,
      headers: { 'content-type': 'application/json', cookie: owner.cookies },
      payload: {
        url: 'https://hooks.example/hook',
        events: ['member.invited'],
        secret: 'hook-secret',
      },
    });
    expect(createdHook.statusCode).toBe(200);

    await gql(app, INVITE, {
      cookies: owner.cookies,
      variables: { workspaceId, emails: ['guest@example.com'] },
    });

    expect(delivered.length).toBeGreaterThan(0);
    const last = delivered.at(-1)!;
    expect(last.signature).toBe(
      `sha256=${hmacSha256('hook-secret', last.body)}`
    );
    expect(
      createHmac('sha256', 'hook-secret').update(last.body).digest('hex')
    ).toHaveLength(64);
  });

  it('never leaks the webhook HMAC secret through the list endpoint', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner-hook@example.com');
    const created = await gql(app, CREATE, { cookies: owner.cookies });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;

    const createdHook = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/webhooks`,
      headers: { 'content-type': 'application/json', cookie: owner.cookies },
      payload: {
        url: 'https://hooks.example/hook',
        events: ['member.invited'],
        secret: 'super-secret',
      },
    });
    // Only the creation response (admin-only action) may ever echo the secret.
    expect((createdHook.json() as { secret?: string }).secret).toBe(
      'super-secret'
    );

    const listed = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/webhooks`,
      headers: { cookie: owner.cookies },
    });
    expect(listed.statusCode).toBe(200);
    const hooks = listed.json() as Array<Record<string, unknown>>;
    expect(hooks.length).toBeGreaterThan(0);
    for (const hook of hooks) {
      expect(hook).not.toHaveProperty('secret');
      expect(JSON.stringify(hook)).not.toContain('super-secret');
    }
  });

  it('rejects inbound Jira webhook deliveries with a missing or wrong shared secret', async () => {
    const { app } = await startTestApp({
      MOSAIC_JIRA_WEBHOOK_SECRET: 'inbound-secret',
    });

    const noHeader = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jira',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(noHeader.statusCode).toBe(403);

    const wrongSecret = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jira',
      headers: {
        'content-type': 'application/json',
        'x-mosaic-jira-secret': 'nope',
      },
      payload: {},
    });
    expect(wrongSecret.statusCode).toBe(403);

    const correct = await app.inject({
      method: 'POST',
      url: '/api/webhooks/jira',
      headers: {
        'content-type': 'application/json',
        'x-mosaic-jira-secret': 'inbound-secret',
      },
      payload: {},
    });
    expect(correct.statusCode).toBe(200);
  });

  it('searches Jira through a mocked REST client and rejects unconfigured access', async () => {
    const unconfigured = await startTestApp();
    const owner = await signIn(unconfigured.app, 'owner@example.com');
    const created = await gql(unconfigured.app, CREATE, {
      cookies: owner.cookies,
    });
    const workspaceId = (
      created.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;
    const missing = await unconfigured.app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/jira/search?q=project=MOS`,
      headers: { cookie: owner.cookies },
    });
    expect(missing.statusCode).toBe(501);

    const fetch: HttpFetcher = async url => {
      if (String(url).includes('/rest/api/3/search')) {
        return jsonResponse({
          issues: [
            {
              key: 'MOS-1',
              fields: {
                summary: 'Ship it',
                status: { name: 'To Do' },
                assignee: null,
              },
            },
          ],
        });
      }
      if (
        String(url).includes('/rest/api/3/issue') &&
        !String(url).endsWith('/search')
      ) {
        return jsonResponse({ key: 'MOS-2' });
      }
      return jsonResponse({}, 404);
    };
    const live = await startTestApp(
      {
        MOSAIC_JIRA_BASE_URL: 'https://jira.example',
        MOSAIC_JIRA_EMAIL: 'bot@example.com',
        MOSAIC_JIRA_API_TOKEN: 'token',
      },
      { fetch }
    );
    const liveOwner = await signIn(live.app, 'jira@example.com');
    const liveWs = await gql(live.app, CREATE, { cookies: liveOwner.cookies });
    const liveId = (
      liveWs.json() as { data: { createWorkspace: { id: string } } }
    ).data.createWorkspace.id;
    const search = await live.app.inject({
      method: 'GET',
      url: `/api/workspaces/${liveId}/jira/search?q=project=MOS`,
      headers: { cookie: liveOwner.cookies },
    });
    expect(search.statusCode).toBe(200);
    expect(
      (search.json() as { items: Array<{ key: string }> }).items[0]?.key
    ).toBe('MOS-1');

    const pushed = await live.app.inject({
      method: 'POST',
      url: `/api/workspaces/${liveId}/jira/push`,
      headers: {
        'content-type': 'application/json',
        cookie: liveOwner.cookies,
      },
      payload: { summary: 'New task' },
    });
    expect(pushed.statusCode).toBe(200);
    expect((pushed.json() as { key: string }).key).toBe('MOS-2');
  });

  it('denies password login when instance policy requires SSO', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner@example.com');
    await gql(app, INSTANCE_POLICY, {
      cookies: owner.cookies,
      variables: { input: { requireSso: true } },
    });
    const denied = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'owner@example.com', password: 'correcthorse' },
    });
    expect(denied.statusCode).toBe(403);
  });
});
