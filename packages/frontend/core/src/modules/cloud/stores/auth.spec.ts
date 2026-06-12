import { AuthProvider } from '@affine/core/modules/cloud/provider/auth';
import { FetchService } from '@affine/core/modules/cloud/services/fetch';
import { GraphQLService } from '@affine/core/modules/cloud/services/graphql';
import { ServerService } from '@affine/core/modules/cloud/services/server';
import { AuthStore } from '@affine/core/modules/cloud/stores/auth';
import { GlobalState, NbstoreService } from '@affine/core/modules/storage';
import { Framework } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

function createStore({
  fetch,
  request,
}: {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  request: (op: string, input: object) => Promise<unknown>;
}) {
  const framework = new Framework();
  framework.service(FetchService, { fetch } as any);
  framework.service(GraphQLService, {} as any);
  framework.impl(GlobalState, {} as any);
  framework.service(ServerService, {
    server: { id: 'test-server' },
  } as any);
  framework.impl(AuthProvider, {} as any);
  framework.service(NbstoreService, {
    realtime: { request },
  } as any);
  framework.store(AuthStore, [
    FetchService,
    GraphQLService,
    GlobalState,
    ServerService,
    AuthProvider,
    NbstoreService,
  ]);
  return framework.provider().get(AuthStore);
}

describe('AuthStore', () => {
  test('loads account profile from realtime after auth session bootstrap', async () => {
    const authMethods = {
      password: { bound: true },
      oauth: { bound: false, providers: [] },
      passkey: { bound: false, count: 0 },
    };
    const fetch = vi.fn(async (input: string) => {
      if (input === '/api/auth/session') {
        return {
          json: async () => ({ user: { id: 'u1' } }),
        } as Response;
      }
      if (input === '/api/auth/methods') {
        return {
          ok: true,
          json: async () => authMethods,
        } as Response;
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    const request = vi.fn(async () => ({
      user: {
        id: 'u1',
        email: 'u1@affine.pro',
        name: 'User',
        emailVerified: true,
        hasPassword: true,
        avatarUrl: null,
        features: ['Admin'],
      },
    }));
    const store = createStore({ fetch, request });

    await expect(store.fetchSession()).resolves.toEqual({
      user: {
        id: 'u1',
        email: 'u1@affine.pro',
        name: 'User',
        emailVerified: true,
        hasPassword: true,
        avatarUrl: null,
        features: ['Admin'],
        authMethods,
      },
    });
    expect(request).toHaveBeenCalledWith('user.profile.get', {});
  });

  test('rejects mismatched realtime profile and auth session', async () => {
    const fetch = vi.fn(async () => {
      return {
        json: async () => ({ user: { id: 'u1' } }),
      } as Response;
    });
    const request = vi.fn(async () => ({
      user: {
        id: 'u2',
        email: 'u2@affine.pro',
        name: 'User',
        emailVerified: true,
        hasPassword: true,
        avatarUrl: null,
        features: [],
      },
    }));
    const store = createStore({ fetch, request });

    await expect(store.fetchSession()).rejects.toThrow(
      'Realtime user profile does not match auth session'
    );
  });
});
