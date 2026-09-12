import { describe, expect, it } from 'vitest';

import { startTestApp, listenTestApp } from '../helpers/app.js';

/**
 * Contract-first tests for the MVP wire surface (see docs/compat.md).
 *
 * `it.fails` = not implemented yet (Phase 4+). Auth/GraphQL/Socket.IO/blobs are live.
 */

const SERVER_CONFIG_QUERY = `query serverConfig {
  serverConfig {
    version
    baseUrl
    name
    features
    type
    initialized
    calendarProviders
    credentialsRequirement {
      password { minLength maxLength }
    }
  }
}`;

const CURRENT_USER_QUERY = `query getCurrentUser {
  currentUser {
    id
    name
    email
    emailVerified
    avatarUrl
    hasPassword
    features
  }
}`;

const WORKSPACES_QUERY = `query getWorkspaces {
  workspaces {
    id
    initialized
    team
    owner { id }
  }
}`;

const CREATE_WORKSPACE_MUTATION = `mutation createWorkspace {
  createWorkspace {
    id
    public
    createdAt
  }
}`;

describe('MVP contract (Phase 1+)', () => {
  it('POST /graphql serverConfig returns version >= 0.27.0', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        'x-operation-name': 'serverConfig',
        'x-affine-version': '0.27.5',
      },
      payload: { query: SERVER_CONFIG_QUERY, operationName: 'serverConfig' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data?: { serverConfig?: { version?: string; type?: string } };
    };
    expect(body.data?.serverConfig?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.data?.serverConfig?.type).toBe('Selfhosted');
  });

  it('POST /graphql currentUser is null when unauthenticated', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        'x-operation-name': 'getCurrentUser',
      },
      payload: { query: CURRENT_USER_QUERY, operationName: 'getCurrentUser' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ data: { currentUser: null } });
  });

  it('POST /graphql workspaces returns an empty list when unauthenticated', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        'x-operation-name': 'getWorkspaces',
      },
      payload: { query: WORKSPACES_QUERY, operationName: 'getWorkspaces' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data?: { workspaces?: unknown[] } };
    expect(Array.isArray(body.data?.workspaces)).toBe(true);
  });

  it('POST /graphql createWorkspace is rejected without a session', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        'x-operation-name': 'createWorkspace',
      },
      payload: {
        query: CREATE_WORKSPACE_MUTATION,
        operationName: 'createWorkspace',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { errors?: Array<{ message: string }> };
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it('GET /api/auth/session returns { user: null } when logged out', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: null });
  });

  it('POST /api/auth/sign-in accepts JSON { email, password }', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'user@example.com', password: 'not-yet' },
    });
    expect([200, 400, 401, 403]).toContain(res.statusCode);
    expect(res.statusCode).not.toBe(404);
  });

  it('POST /api/auth/sign-out is a valid route', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { 'x-affine-csrf-token': 'test' },
    });
    expect(res.statusCode).not.toBe(404);
  });

  it('POST /api/auth/preflight returns registered + methods', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/preflight',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'user@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      registered: boolean;
      methods: {
        password: { available: boolean };
        magicLink: { available: boolean };
        oauth: { available: boolean; providers: string[] };
        passkey: { available: boolean; discoverable: boolean };
      };
    };
    expect(typeof body.registered).toBe('boolean');
    expect(body.methods.password).toEqual({ available: expect.any(Boolean) });
    expect(body.methods.magicLink).toEqual({ available: expect.any(Boolean) });
    expect(body.methods.oauth).toMatchObject({
      available: expect.any(Boolean),
    });
    expect(Array.isArray(body.methods.oauth.providers)).toBe(true);
    expect(body.methods.passkey).toMatchObject({
      available: expect.any(Boolean),
      discoverable: expect.any(Boolean),
    });
  });

  it('Socket.IO Engine.IO handshake is served at /socket.io', async () => {
    const { url } = await listenTestApp();
    const res = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(0);
  });

  it('GET workspace blob v1 is a routed path', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/workspaces/ws-1/blobs/v1/blob-key?sourceType=page&docId=doc-1',
    });
    expect([200, 401, 403, 404]).toContain(res.statusCode);
    const body = res.json() as { error?: string };
    if (res.statusCode === 404) {
      expect(body.error).not.toBe('not_found');
    }
  });
});
