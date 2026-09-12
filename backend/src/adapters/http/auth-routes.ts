import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import {
  publicUser,
  type AuthService,
} from '../../application/auth-service.js';
import type { SsoService } from '../../application/sso-service.js';
import { errors } from '../../domain/errors.js';
import {
  attachAuthCookies,
  clearAuthCookies,
  csrfMatches,
  type CookiePolicy,
} from './cookies.js';

const EmailPassword = z.object({
  email: z.string().min(1),
  password: z.string().optional(),
  callbackUrl: z.string().optional(),
  client_nonce: z.string().optional(),
});

const Preflight = z.object({
  email: z.string().min(1),
});

const Exchange = z.object({
  code: z.string().min(1),
  installationId: z.string().min(1),
  platform: z.enum(['ios', 'android', 'electron']),
  deviceName: z.string().optional(),
});

const OauthPreflight = z.object({
  provider: z.string().min(1),
  client: z.string().optional(),
  redirect_uri: z.string().optional(),
  client_nonce: z.string().optional(),
});

const OauthCallback = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  client_nonce: z.string().optional(),
});

const Refresh = z.object({
  refreshToken: z.string().min(1),
});

function samlResponseFromBody(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return new URLSearchParams(body).get('SAMLResponse') ?? undefined;
  }
  if (Buffer.isBuffer(body)) {
    return (
      new URLSearchParams(body.toString('utf8')).get('SAMLResponse') ??
      undefined
    );
  }
  if (body && typeof body === 'object' && 'SAMLResponse' in body) {
    const value = (body as { SAMLResponse?: unknown }).SAMLResponse;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function clientKind(request: FastifyRequest): 'web' | 'native' {
  return request.headers['x-affine-client-kind'] === 'native'
    ? 'native'
    : 'web';
}

function requireCsrf(request: FastifyRequest): void {
  if (clientKind(request) === 'native') {
    return;
  }
  const session = request.authSession;
  if (!session) {
    return;
  }
  const header =
    (request.headers['x-affine-csrf-token'] as string | undefined) ??
    request.headers['x-csrf-token'];
  if (!csrfMatches(session, typeof header === 'string' ? header : undefined)) {
    throw errors.invalidAuthState();
  }
}

export const authRoutes = fp<{
  auth: AuthService;
  cookies: CookiePolicy;
  sso: SsoService;
}>(
  async (app, opts) => {
    const authLimit = {
      config: { rateLimit: { max: app.mosaicAuthRateLimit } },
    };

    app.get('/api/auth/session', async request => {
      const user = await opts.auth.getUser(request.authSession);
      if (!user) {
        return { user: null };
      }
      return { user: { id: user.id } };
    });

    app.get('/api/auth/methods', async request => {
      const user = await opts.auth.getUser(request.authSession);
      if (!user) {
        return undefined;
      }
      return opts.auth.boundMethods(user);
    });

    app.post('/api/auth/preflight', authLimit, async request => {
      const body = Preflight.parse(request.body);
      return opts.auth.preflight(body.email);
    });

    app.post('/api/auth/sign-in', authLimit, async (request, reply) => {
      const body = EmailPassword.parse(request.body);
      if (body.callbackUrl && !body.password) {
        throw errors.emailServiceNotConfigured();
      }
      if (!body.password) {
        throw errors.passwordRequired();
      }
      const result = await opts.auth.signInPassword({
        email: body.email,
        password: body.password,
        clientKind: clientKind(request),
        appVersion:
          (request.headers['x-affine-version'] as string | undefined) ?? null,
      });
      attachAuthCookies(
        reply,
        result.session,
        result.cookieToken,
        opts.cookies
      );
      return {
        ...publicUser(result.user),
        ...(result.exchangeCode ? { exchangeCode: result.exchangeCode } : {}),
      };
    });

    app.post('/api/auth/sign-out', async (request, reply) => {
      requireCsrf(request);
      await opts.auth.signOut(request.authSession);
      clearAuthCookies(reply, opts.cookies);
      return { ok: true };
    });

    app.post('/api/auth/magic-link', authLimit, async () => {
      throw errors.emailServiceNotConfigured();
    });

    app.post('/api/auth/open-app/sign-in', authLimit, async () => {
      throw errors.emailServiceNotConfigured();
    });

    app.post('/api/auth/open-app/sign-in-code', authLimit, async () => {
      throw errors.emailServiceNotConfigured();
    });

    app.get('/api/auth/captcha', async () => {
      throw errors.actionForbidden('Captcha is not enabled.');
    });

    app.get('/api/auth/sessions', async request => {
      const user = await opts.auth.requireUser(request.authSession);
      return opts.auth.listDeviceSessions(user, request.authSession!.id);
    });

    app.delete('/api/auth/sessions/:id', async (request, reply) => {
      requireCsrf(request);
      const user = await opts.auth.requireUser(request.authSession);
      const { id } = request.params as { id: string };
      const wasCurrent = await opts.auth.revokeDeviceSession(user, id);
      if (wasCurrent && request.authSession?.id === id) {
        clearAuthCookies(reply, opts.cookies);
      }
      return { ok: true };
    });

    app.post('/api/auth/sessions/revoke-all', async request => {
      requireCsrf(request);
      const user = await opts.auth.requireUser(request.authSession);
      await opts.auth.revokeAllOtherSessions(user, request.authSession!.id);
      return { ok: true };
    });

    app.post('/api/auth/session/refresh', authLimit, async request => {
      const body = Refresh.parse(request.body);
      return opts.auth.refresh(body.refreshToken);
    });

    app.post('/api/auth/session/revoke', async request => {
      const body = Refresh.parse(request.body);
      await opts.auth.revokeByRefreshToken(body.refreshToken);
      return { ok: true };
    });

    app.post(
      '/api/auth/session/exchange',
      authLimit,
      async (request, reply) => {
        const body = Exchange.parse(request.body);
        const tokens = await opts.auth.exchange({
          code: body.code,
          installationId: body.installationId,
          platform: body.platform,
          deviceName: body.deviceName ?? null,
        });
        clearAuthCookies(reply, opts.cookies);
        return tokens;
      }
    );

    app.post('/api/oauth/callback', authLimit, async (request, reply) => {
      const body = OauthCallback.parse(request.body);
      const input: {
        code: string;
        state: string;
        clientKind: 'web' | 'native';
        clientNonce?: string;
      } = {
        code: body.code,
        state: body.state,
        clientKind: clientKind(request),
      };
      if (body.client_nonce) {
        input.clientNonce = body.client_nonce;
      }
      const result = await opts.sso.callback(input);
      attachAuthCookies(
        reply,
        result.session,
        result.cookieToken,
        opts.cookies
      );
      return {
        ...publicUser(result.user, await opts.auth.hasPassword(result.user)),
        redirectUri: result.redirectUri,
        ...(result.exchangeCode ? { exchangeCode: result.exchangeCode } : {}),
      };
    });

    app.post('/api/oauth/preflight', authLimit, async request => {
      const body = OauthPreflight.parse(request.body);
      const input: {
        provider: string;
        client?: string;
        redirectUri?: string;
        clientNonce?: string;
      } = { provider: body.provider };
      if (body.client) input.client = body.client;
      if (body.redirect_uri) input.redirectUri = body.redirect_uri;
      if (body.client_nonce) input.clientNonce = body.client_nonce;
      return opts.sso.preflight(input);
    });

    app.get('/api/auth/saml/metadata', async (_request, reply) => {
      if (!opts.sso.samlEnabled()) {
        throw errors.unknownOauth();
      }
      void reply.header('content-type', 'application/xml; charset=utf-8');
      return opts.sso.samlMetadata();
    });

    app.get('/api/auth/saml/login', async (_request, reply) => {
      return reply.redirect(opts.sso.samlRedirectUrl());
    });

    app.post('/api/auth/saml/acs', authLimit, async (request, reply) => {
      const encoded = samlResponseFromBody(request.body);
      if (!encoded) {
        throw errors.samlInvalid();
      }
      const result = await opts.sso.completeSaml(encoded, clientKind(request));
      attachAuthCookies(
        reply,
        result.session,
        result.cookieToken,
        opts.cookies
      );
      return reply.redirect(`${request.protocol}://${request.hostname}/`);
    });
  },
  { name: 'mosaic-auth-routes' }
);

declare module 'fastify' {
  interface FastifyInstance {
    mosaicAuthRateLimit: number;
  }
}
