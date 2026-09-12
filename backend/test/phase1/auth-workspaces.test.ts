import { describe, expect, it } from 'vitest';

import { startTestApp } from '../helpers/app.js';
import { cookieHeader } from '../helpers/cookies.js';

const CURRENT_USER = `query getCurrentUser {
  currentUser { id name email emailVerified hasPassword features }
}`;

const WORKSPACES = `query getWorkspaces {
  workspaces { id initialized team owner { id } }
}`;

const CREATE = `mutation createWorkspace {
  createWorkspace { id public createdAt }
}`;

const DELETE = `mutation deleteWorkspace($id: String!) {
  deleteWorkspace(id: $id)
}`;

async function gql(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  query: string,
  opts?: { cookies?: string; variables?: Record<string, unknown>; op?: string }
) {
  return app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      'x-operation-name': opts?.op ?? 'op',
      ...(opts?.cookies ? { cookie: opts.cookies } : {}),
    },
    payload: { query, variables: opts?.variables ?? {} },
  });
}

describe('Phase 1 — Auth', () => {
  it('registers via password sign-in and returns session cookies', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'owner@example.com', password: 'correcthorse' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; email: string; name: string };
    expect(body.email).toBe('owner@example.com');
    expect(body.name).toBe('owner');
    const cookies = cookieHeader(res);
    expect(cookies).toContain('affine_session=');
    expect(cookies).toContain('affine_user_id=');
    expect(cookies).toContain('affine_csrf_token=');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookies },
    });
    expect(session.json()).toEqual({ user: { id: body.id } });
  });

  it('rejects a wrong password with WRONG_SIGN_IN_CREDENTIALS', async () => {
    const { app } = await startTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'owner@example.com', password: 'correcthorse' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'owner@example.com', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      status: 400,
      code: 'WRONG_SIGN_IN_CREDENTIALS',
      type: 'WRONG_SIGN_IN_CREDENTIALS',
      name: 'WRONG_SIGN_IN_CREDENTIALS',
      message: 'Wrong sign in credentials.',
    });
  });

  it('signs out with CSRF and clears the session', async () => {
    const { app } = await startTestApp();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'owner@example.com', password: 'correcthorse' },
    });
    const cookies = cookieHeader(login);
    const csrf = cookies
      .split('; ')
      .find(part => part.startsWith('affine_csrf_token='))
      ?.split('=')[1];

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: {
        cookie: cookies,
        'x-affine-csrf-token': csrf ?? '',
      },
    });
    expect(res.statusCode).toBe(200);

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookies },
    });
    expect(session.json()).toEqual({ user: null });
  });

  it('creates the first user as Admin via setup', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup/create-admin-user',
      headers: { 'content-type': 'application/json' },
      payload: {
        name: 'Ada',
        email: 'ada@example.com',
        password: 'correcthorse',
      },
    });
    expect(res.statusCode).toBe(200);
    const cookies = cookieHeader(res);
    const me = await gql(app, CURRENT_USER, { cookies, op: 'getCurrentUser' });
    expect(me.json()).toMatchObject({
      data: {
        currentUser: {
          email: 'ada@example.com',
          name: 'Ada',
          features: ['Admin'],
        },
      },
    });
  });

  it('exchanges a native sign-in for bearer tokens', async () => {
    const { app } = await startTestApp();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: {
        'content-type': 'application/json',
        'x-affine-client-kind': 'native',
      },
      payload: { email: 'native@example.com', password: 'correcthorse' },
    });
    const { exchangeCode, id } = login.json() as {
      exchangeCode: string;
      id: string;
    };
    expect(exchangeCode).toBeTruthy();

    const tokens = await app.inject({
      method: 'POST',
      url: '/api/auth/session/exchange',
      headers: { 'content-type': 'application/json' },
      payload: {
        code: exchangeCode,
        installationId: '11111111-1111-4111-8111-111111111111',
        platform: 'electron',
        deviceName: 'test-pc',
      },
    });
    expect(tokens.statusCode).toBe(200);
    const body = tokens.json() as {
      tokenType: string;
      accessToken: string;
      refreshToken: string;
      session: { id: string };
    };
    expect(body.tokenType).toBe('Bearer');

    const me = await gql(app, CURRENT_USER, {
      op: 'getCurrentUser',
      cookies: undefined,
    });
    const authed = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${body.accessToken}`,
        'x-operation-name': 'getCurrentUser',
      },
      payload: { query: CURRENT_USER },
    });
    expect(authed.json()).toMatchObject({
      data: { currentUser: { id, email: 'native@example.com' } },
    });
    expect(me.json()).toMatchObject({ data: { currentUser: null } });

    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/auth/session/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refreshToken: body.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json() as { accessToken: string; tokenType: string };
    expect(next.tokenType).toBe('Bearer');
    expect(next.accessToken).not.toBe(body.accessToken);
  });
});

describe('Phase 1 — Workspaces', () => {
  it('creates, lists, and deletes a workspace for the owner', async () => {
    const { app } = await startTestApp();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'owner@example.com', password: 'correcthorse' },
    });
    const cookies = cookieHeader(login);

    const created = await gql(app, CREATE, { cookies, op: 'createWorkspace' });
    expect(created.statusCode).toBe(200);
    const workspace = (
      created.json() as {
        data: { createWorkspace: { id: string; public: boolean } };
      }
    ).data.createWorkspace;
    expect(workspace.public).toBe(false);

    const list = await gql(app, WORKSPACES, { cookies, op: 'getWorkspaces' });
    const workspaces = (
      list.json() as {
        data: { workspaces: Array<{ id: string; owner: { id: string } }> };
      }
    ).data.workspaces;
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]?.id).toBe(workspace.id);

    const fetched = await gql(
      app,
      `query getWorkspace($id: String!) { workspace(id: $id) { id } }`,
      { cookies, op: 'getWorkspace', variables: { id: workspace.id } }
    );
    expect(fetched.json()).toMatchObject({
      data: { workspace: { id: workspace.id } },
    });

    const removed = await gql(app, DELETE, {
      cookies,
      op: 'deleteWorkspace',
      variables: { id: workspace.id },
    });
    expect(removed.json()).toEqual({ data: { deleteWorkspace: true } });

    const empty = await gql(app, WORKSPACES, { cookies, op: 'getWorkspaces' });
    expect(empty.json()).toMatchObject({ data: { workspaces: [] } });
  });

  it('returns currentUser quota stub and GraphQL AUTHENTICATION_REQUIRED without a session', async () => {
    const { app } = await startTestApp();
    const denied = await gql(app, CREATE, { op: 'createWorkspace' });
    expect(denied.json()).toMatchObject({
      errors: [{ extensions: { name: 'AUTHENTICATION_REQUIRED' } }],
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'quota@example.com', password: 'correcthorse' },
    });
    const cookies = cookieHeader(login);
    const me = await gql(
      app,
      `query quota {
        currentUser {
          id
          quota { name memberLimit }
          quotaUsage { storageQuota }
        }
      }`,
      { cookies, op: 'quota' }
    );
    expect(me.json()).toMatchObject({
      data: {
        currentUser: {
          quota: { name: 'Mosaic', memberLimit: 10_000 },
          quotaUsage: { storageQuota: 0 },
        },
      },
    });
  });
});

describe('Phase 1 — Security', () => {
  it('hashes passwords with Argon2id', async () => {
    const { createArgon2Hasher } =
      await import('../../src/application/password-hasher.js');
    const hasher = createArgon2Hasher();
    const digest = await hasher.hash('correcthorse');
    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(digest, 'correcthorse')).toBe(true);
    expect(await hasher.verify(digest, 'wrong')).toBe(false);
  });

  it('rate-limits auth endpoints', async () => {
    const { app } = await startTestApp({ RATE_LIMIT_AUTH_MAX: 1 });
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/preflight',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'rate@example.com' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/preflight',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'rate@example.com' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ name: 'TOO_MANY_REQUEST' });
  });

  it('keeps password available for unregistered emails when signup is allowed', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/preflight',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'new@example.com' },
    });
    expect(res.json()).toMatchObject({
      registered: false,
      methods: { password: { available: true } },
    });
  });

  it('refuses signup when MOSAIC_ALLOW_SIGNUP is false', async () => {
    const { app } = await startTestApp({
      MOSAIC_ALLOW_SIGNUP: false,
      allowSignup: false,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'blocked@example.com', password: 'correcthorse' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ name: 'WRONG_SIGN_IN_CREDENTIALS' });
  });
});
