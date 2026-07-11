import { describe, expect, test, vi } from 'vitest';

import {
  AuthSessionError,
  AuthTokenBroker,
  type AuthTokenPair,
  type AuthTokenResponse,
  type AuthTokenStorage,
  createRealtimeAuthAdapter,
  createRequestAuthAdapter,
  withAuthRetry,
} from './token-broker';

const now = Date.parse('2026-07-11T00:00:00.000Z');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function response(sequence: number): AuthTokenResponse {
  return {
    tokenType: 'Bearer',
    accessToken: `access-${sequence}`,
    expiresIn: 900,
    refreshToken: `refresh-${sequence}`,
    refreshExpiresAt: '2026-08-11T00:00:00.000Z',
    session: {
      id: 'session-1',
      absoluteExpiresAt: '2027-01-11T00:00:00.000Z',
    },
  };
}

function pair(sequence: number, accessExpiresAt: number): AuthTokenPair {
  return {
    version: 1,
    ...response(sequence),
    accessExpiresAt: new Date(accessExpiresAt).toISOString(),
  };
}

function setup(initial: AuthTokenPair | null) {
  let persisted = initial;
  const storage: AuthTokenStorage = {
    load: vi.fn(async () => persisted),
    save: vi.fn(async next => {
      persisted = next;
    }),
    clear: vi.fn(async () => {
      persisted = null;
    }),
  };
  const transport = { refresh: vi.fn(async () => response(2)) };
  return {
    broker: new AuthTokenBroker(storage, transport, {
      now: () => now,
      retryDelays: [],
    }),
    storage,
    transport,
    persisted: () => persisted,
  };
}

describe('AuthTokenBroker', () => {
  test('proactively refreshes and atomically persists before publishing', async () => {
    const { broker, storage, persisted } = setup(pair(1, now + 30_000));
    const states: string[] = [];
    broker.observeAuthState(state => states.push(state.status));

    await expect(broker.getValidAccessToken()).resolves.toBe('access-2');
    expect(storage.save).toHaveBeenCalledOnce();
    expect(persisted()?.accessToken).toBe('access-2');
    expect(states).toEqual([
      'initializing',
      'authenticated',
      'refreshing',
      'authenticated',
    ]);
  });

  test('collapses concurrent refresh into one transport request', async () => {
    const { broker, transport } = setup(pair(1, now + 30_000));
    const tokens = await Promise.all(
      Array.from({ length: 100 }, () => broker.getValidAccessToken())
    );

    expect(new Set(tokens)).toEqual(new Set(['access-2']));
    expect(transport.refresh).toHaveBeenCalledOnce();
  });

  test('keeps credentials for transient failures', async () => {
    const { broker, storage, transport } = setup(pair(1, now + 30_000));
    transport.refresh.mockRejectedValueOnce({
      code: 'NETWORK_ERROR',
      config: { body: 'refresh-1' },
    });
    const states: unknown[] = [];
    broker.observeAuthState(state => states.push(state));

    const error = await broker.getValidAccessToken().catch(error => error);
    expect(error).toMatchObject({
      transient: true,
    });
    expect(JSON.stringify(error)).not.toContain('refresh-1');
    expect(JSON.stringify(states)).not.toContain('refresh-1');
    expect(storage.clear).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({
      status: 'offline-authenticated',
      code: 'NETWORK_ERROR',
    });
  });

  test('retries transient refresh failures with bounded jittered backoff', async () => {
    const { storage, transport } = setup(pair(1, now + 30_000));
    transport.refresh
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(response(2));
    const sleep = vi.fn(async () => {});
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => now,
      random: () => 0.5,
      retryDelays: [250],
      sleep,
    });

    await expect(broker.getValidAccessToken()).resolves.toBe('access-2');
    expect(transport.refresh).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  test('clears credentials only for permanent auth failures', async () => {
    const { broker, storage, transport } = setup(pair(1, now + 30_000));
    transport.refresh.mockRejectedValueOnce({ code: 'AUTH_SESSION_REVOKED' });

    await expect(broker.getValidAccessToken()).rejects.toMatchObject({
      code: 'AUTH_SESSION_REVOKED',
      transient: false,
    });
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  test('retries a request once only for access-token expiration', async () => {
    const { broker, transport } = setup(pair(1, now + 600_000));
    const request = vi
      .fn<(token: string) => Promise<string>>()
      .mockRejectedValueOnce({ code: 'ACCESS_TOKEN_EXPIRED' })
      .mockResolvedValueOnce('ok');

    await expect(withAuthRetry(broker, request)).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    expect(transport.refresh).toHaveBeenCalledOnce();
  });

  test('does not retry permission failures', async () => {
    const { broker, transport } = setup(pair(1, now + 600_000));
    await expect(
      withAuthRetry(broker, async () => {
        throw new AuthSessionError('FORBIDDEN', false);
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      createRealtimeAuthAdapter(broker).recover({ code: 'FORBIDDEN' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(transport.refresh).not.toHaveBeenCalled();
  });

  test('serializes initialization before set and clear mutations', async () => {
    const loaded = deferred<AuthTokenPair | null>();
    let persisted: AuthTokenPair | null = pair(1, now + 600_000);
    const storage: AuthTokenStorage = {
      load: vi.fn(() => loaded.promise),
      save: vi.fn(async next => {
        persisted = next;
      }),
      clear: vi.fn(async () => {
        persisted = null;
      }),
    };
    const broker = new AuthTokenBroker(
      storage,
      { refresh: vi.fn() },
      {
        now: () => now,
      }
    );
    const setting = broker.set(response(2));
    loaded.resolve(persisted);
    await setting;

    expect(await broker.getValidAccessToken(0)).toBe('access-2');
    await broker.clear('logout');
    expect(persisted).toBeNull();
    expect(await broker.getValidAccessToken()).toBeNull();
  });

  test('does not let delayed initialization undo clear', async () => {
    const loaded = deferred<AuthTokenPair | null>();
    let persisted: AuthTokenPair | null = pair(1, now + 600_000);
    const storage: AuthTokenStorage = {
      load: vi.fn(() => loaded.promise),
      save: vi.fn(),
      clear: vi.fn(async () => {
        persisted = null;
      }),
    };
    const broker = new AuthTokenBroker(
      storage,
      { refresh: vi.fn() },
      {
        now: () => now,
      }
    );
    const clearing = broker.clear('logout');
    loaded.resolve(persisted);
    await clearing;

    expect(persisted).toBeNull();
    expect(await broker.getValidAccessToken()).toBeNull();
  });

  test('retries pending secure-store persistence without rotating again', async () => {
    const { broker, storage, transport, persisted } = setup(
      pair(1, now + 30_000)
    );
    vi.mocked(storage.save).mockRejectedValueOnce(new Error('locked'));

    await expect(broker.getValidAccessToken()).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    const recovered = await broker.refresh('storage-retry');
    expect(recovered).toMatchObject({ accessToken: 'access-2' });
    expect(JSON.stringify(recovered)).not.toContain('refresh-2');
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(persisted()?.accessToken).toBe('access-2');
  });

  test('does not resurrect a session when clear races refresh', async () => {
    const { broker, transport, persisted } = setup(pair(1, now + 600_000));
    await broker.getValidAccessToken(0);
    const rotated = deferred<AuthTokenResponse>();
    transport.refresh.mockReturnValueOnce(rotated.promise);
    const refreshing = broker.refresh('manual');
    await Promise.resolve();
    const clearing = broker.clear('logout');
    rotated.resolve(response(2));

    await expect(refreshing).rejects.toMatchObject({
      code: 'AUTH_OPERATION_CANCELLED',
    });
    await clearing;
    expect(persisted()).toBeNull();
    expect(await broker.getValidAccessToken()).toBeNull();
  });

  test('isolates observers and rejects malformed persisted records', async () => {
    const { broker } = setup(pair(1, now + 600_000));
    const states: unknown[] = [];
    broker.observeAuthState(() => {
      throw new Error('observer failure');
    });
    broker.observeAuthState(state => states.push(state));
    await expect(broker.getValidAccessToken()).resolves.toBe('access-1');
    expect(JSON.stringify(states)).not.toContain('refresh-1');

    const storage: AuthTokenStorage = {
      load: vi.fn(async () => ({ version: 2 }) as never),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const malformed = new AuthTokenBroker(storage, { refresh: vi.fn() });
    await expect(malformed.getValidAccessToken()).resolves.toBeNull();
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  test('shares one refresh across HTTP replay and realtime recovery', async () => {
    const { broker, transport } = setup(pair(1, now + 600_000));
    const rotated = deferred<AuthTokenResponse>();
    transport.refresh.mockReturnValueOnce(rotated.promise);
    const request = vi
      .fn<(token: string) => Promise<string>>()
      .mockRejectedValueOnce({ code: 'ACCESS_TOKEN_EXPIRED' })
      .mockResolvedValueOnce('ok');
    const realtime = createRealtimeAuthAdapter(broker);
    const http = createRequestAuthAdapter(broker).execute(request);
    const socket = realtime.recover({ code: 'ACCESS_TOKEN_EXPIRED' });
    await Promise.resolve();
    rotated.resolve(response(2));

    await expect(Promise.all([http, socket])).resolves.toEqual([
      'ok',
      'access-2',
    ]);
    expect(transport.refresh).toHaveBeenCalledOnce();
  });

  test.each([
    { name: 'permanent', error: { code: 'AUTH_SESSION_REVOKED' } },
    { name: 'transient', error: new TypeError('offline') },
  ])('ignores a stale $name refresh failure after a new login', async item => {
    const { broker, transport, persisted } = setup(pair(1, now + 600_000));
    await broker.getValidAccessToken(0);
    const oldRefresh = deferred<AuthTokenResponse>();
    transport.refresh.mockReturnValueOnce(oldRefresh.promise);
    const refreshing = broker.refresh('manual');
    await Promise.resolve();
    await broker.set(response(3));
    oldRefresh.reject(item.error);

    await expect(refreshing).rejects.toMatchObject({
      code: 'AUTH_OPERATION_CANCELLED',
    });
    expect(await broker.getValidAccessToken(0)).toBe('access-3');
    expect(persisted()?.accessToken).toBe('access-3');
  });

  test('retries initialization after a transient storage failure', async () => {
    const stored = pair(1, now + 600_000);
    const storage: AuthTokenStorage = {
      load: vi
        .fn<() => Promise<AuthTokenPair | null>>()
        .mockRejectedValueOnce(new Error('locked'))
        .mockResolvedValueOnce(stored),
      save: vi.fn(),
      clear: vi.fn(),
    };
    const broker = new AuthTokenBroker(
      storage,
      { refresh: vi.fn() },
      {
        now: () => now,
      }
    );
    const states: string[] = [];
    broker.observeAuthState(state => states.push(state.status));

    await expect(broker.getValidAccessToken()).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
      transient: true,
    });
    await expect(broker.getValidAccessToken()).resolves.toBe('access-1');
    expect(storage.load).toHaveBeenCalledTimes(2);
    expect(states).toEqual(['initializing', 'authenticated']);
  });

  test.each([0, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    'rejects malformed expiresIn %s before persistence',
    async expiresIn => {
      const { broker, storage, transport } = setup(pair(1, now + 30_000));
      transport.refresh.mockResolvedValueOnce({ ...response(2), expiresIn });

      await expect(broker.getValidAccessToken()).rejects.toMatchObject({
        code: 'AUTH_TOKEN_RESPONSE_INVALID',
      });
      expect(storage.save).not.toHaveBeenCalled();
    }
  );

  test('normalizes clear storage failures after clearing memory', async () => {
    const { broker, storage } = setup(pair(1, now + 600_000));
    await broker.getValidAccessToken(0);
    vi.mocked(storage.clear).mockRejectedValueOnce(new Error('locked'));

    await expect(broker.clear('logout')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    await expect(broker.getValidAccessToken()).resolves.toBeNull();
  });

  test('revokes captured credential even when local clear fails', async () => {
    const { broker, storage } = setup(pair(1, now + 600_000));
    await broker.getValidAccessToken(0);
    vi.mocked(storage.clear).mockRejectedValueOnce(new Error('locked'));
    const revoke = vi.fn(async () => {});

    await expect(broker.revoke('logout', revoke)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    expect(revoke).toHaveBeenCalledWith('refresh-1');
    await expect(broker.getValidAccessToken()).resolves.toBeNull();
  });

  test('initializes when the first consumer only observes state', async () => {
    const { broker, storage } = setup(pair(1, now + 600_000));
    const states: string[] = [];
    broker.observeAuthState(state => states.push(state.status));
    await vi.waitFor(() => expect(states.at(-1)).toBe('authenticated'));

    expect(storage.load).toHaveBeenCalledOnce();
    expect(states).toEqual(['initializing', 'authenticated']);
  });

  test('redacts unknown external error codes', async () => {
    const { broker, transport } = setup(pair(1, now + 30_000));
    transport.refresh.mockRejectedValueOnce({
      code: 'secret-refresh-1',
    });

    await expect(broker.getValidAccessToken()).rejects.toMatchObject({
      code: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
    });
  });
});
