import { describe, expect, test, vi } from 'vitest';

import {
  AuthSessionError,
  AuthTokenBroker,
  type AuthTokenPair,
  type AuthTokenResponse,
  type AuthTokenStorage,
  classifyAuthError,
  classifyAuthHttpError,
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
  test('does not extend access-token lifetime when a refresh reply is processed after sleep', async () => {
    const { storage, transport, persisted } = setup(pair(1, now + 30_000));
    let clock = now;
    transport.refresh.mockImplementationOnce(async () => {
      // The response has a 15-minute grant, but the client resumes 27 minutes later.
      clock += 27 * 60_000;
      return response(2);
    });
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      retryDelays: [],
    });
    await broker.refresh('before-sleep');
    expect(persisted()?.accessExpiresAt).toBe(
      new Date(now + 900_000).toISOString()
    );
    expect(Date.parse(persisted()!.accessExpiresAt)).toBeLessThan(clock);
    transport.refresh.mockResolvedValueOnce(response(3));
    await expect(broker.getValidAccessToken(0)).resolves.toBe('access-3');
    expect(transport.refresh).toHaveBeenCalledTimes(2);
  });

  test('measures access-token TTL from the successful retry rather than the original attempt', async () => {
    const { storage, transport, persisted } = setup(pair(1, now + 30_000));
    let clock = now;
    transport.refresh.mockImplementationOnce(async () => {
      clock += 27 * 60_000;
      throw new AuthSessionError('NETWORK_ERROR', true);
    });
    transport.refresh.mockImplementationOnce(async () => {
      clock += 2_000;
      return response(2);
    });
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      retryDelays: [0],
      sleep: async () => {},
    });
    await broker.refresh('retry-after-wake');
    expect(persisted()?.accessExpiresAt).toBe(
      new Date(now + 27 * 60_000 + 900_000).toISOString()
    );
    expect(transport.refresh).toHaveBeenCalledTimes(2);
  });

  test('recovers a lost rotation response after sleep and broker restart with the persisted operation', async () => {
    const { storage, persisted } = setup(pair(1, now + 30_000));
    const requestId = '00000000-0000-4000-8000-000000000001';
    let clock = now;
    let rotated = false;
    const transport = {
      refresh: vi.fn(async (token: string, id?: string) => {
        expect(token).toBe('refresh-1');
        expect(id).toBe(requestId);
        expect(persisted()?.refreshRequestId).toBe(requestId);
        if (!rotated) {
          rotated = true; // The server committed N -> N+1, but the reply was lost.
          throw new AuthSessionError('NETWORK_ERROR', true);
        }
        return response(2);
      }),
    };
    const options = {
      now: () => clock,
      retryDelays: [],
      createRefreshRequestId: () => requestId,
    };
    const broker = new AuthTokenBroker(storage, transport, options);
    await expect(broker.refresh('proactive')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(persisted()?.refreshToken).toBe('refresh-1');
    clock += 27 * 60_000;
    const restarted = new AuthTokenBroker(storage, transport, {
      ...options,
      createRefreshRequestId: () => {
        throw new Error('must reuse durable operation');
      },
    });
    await expect(restarted.getValidAccessToken()).resolves.toBe('access-2');
    expect(persisted()?.refreshToken).toBe('refresh-2');
    expect(persisted()?.refreshRequestId).toBeUndefined();
  });

  test('never dispatches refresh if its operation cannot be persisted', async () => {
    const { storage, transport } = setup(pair(1, now + 30_000));
    vi.mocked(storage.save).mockRejectedValueOnce(
      new Error('disk unavailable')
    );
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => now,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
    });
    await expect(broker.refresh('manual')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    expect(transport.refresh).not.toHaveBeenCalled();
  });

  test('reloads a newer durable pair instead of replaying a stale in-memory generation', async () => {
    const { storage, transport, persisted } = setup(pair(1, now + 30_000));
    const options = {
      now: () => now,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
    };
    const first = new AuthTokenBroker(storage, transport, options);
    const stale = new AuthTokenBroker(storage, transport, options);
    await expect(stale.getValidAccessToken(0)).resolves.toBe('access-1');
    await first.refresh('proactive');
    await expect(stale.refresh('after-owner-handoff')).resolves.toMatchObject({
      accessToken: 'access-2',
    });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(persisted()?.refreshToken).toBe('refresh-2');
  });

  test('does not resurrect a durable operation when clear races its journal write', async () => {
    const { storage, transport, persisted } = setup(pair(1, now + 30_000));
    const writing = deferred<void>();
    const started = deferred<void>();
    vi.mocked(storage.save).mockImplementationOnce(async () => {
      started.resolve();
      await writing.promise;
    });
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => now,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
    });
    const refreshing = broker.refresh('proactive');
    await started.promise;
    const clearing = broker.clear('sign-out');
    // Let clear increment the mutation epoch before the pending write finishes.
    await Promise.resolve();
    writing.resolve();
    await expect(refreshing).rejects.toMatchObject({
      code: 'AUTH_OPERATION_CANCELLED',
    });
    await clearing;
    expect(transport.refresh).not.toHaveBeenCalled();
    expect(persisted()).toBeNull();
  });

  test('reports forbidden without retrying or clearing a valid credential', async () => {
    const { storage, transport } = setup(pair(1, now + 30_000));
    transport.refresh.mockRejectedValue(
      classifyAuthHttpError(403, {
        code: 'Forbidden',
        type: 'ACTION_FORBIDDEN',
      })
    );
    const broker = new AuthTokenBroker(storage, transport, { now: () => now });
    await expect(broker.refresh('manual')).rejects.toMatchObject({
      code: 'ACTION_FORBIDDEN',
      transient: false,
    });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(storage.clear).not.toHaveBeenCalled();
  });

  test.each([
    [
      503,
      { code: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE', type: 'NETWORK_ERROR' },
      'AUTH_SESSION_TEMPORARILY_UNAVAILABLE',
      true,
    ],
    [
      403,
      { code: 'Forbidden', type: 'ACTION_FORBIDDEN' },
      'ACTION_FORBIDDEN',
      false,
    ],
    [403, {}, 'ACTION_FORBIDDEN', false],
    [401, { code: 'REFRESH_TOKEN_REUSED' }, 'REFRESH_TOKEN_REUSED', false],
    [401, { code: 'AUTH_SESSION_REVOKED' }, 'AUTH_SESSION_REVOKED', false],
    [429, {}, 'TOO_MANY_REQUESTS', true],
  ])(
    'classifies HTTP %s with safe structured codes',
    (status, body, code, transient) => {
      expect(classifyAuthHttpError(status, body)).toMatchObject({
        code,
        transient,
      });
      expect(classifyAuthError({ code: 'secret-token' }).message).not.toContain(
        'secret-token'
      );
    }
  );

  test('uses legacy refresh without a journal when capability is not advertised', async () => {
    const { storage, transport } = setup(pair(1, now + 30_000));
    const generate = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => now,
      createRefreshRequestId: generate,
      supportsRefreshRequestId: async () => false,
    });
    await broker.refresh('old-server');
    expect(generate).not.toHaveBeenCalled();
    expect(transport.refresh).toHaveBeenCalledWith('refresh-1', undefined);
    expect(storage.save).toHaveBeenCalledOnce();
  });

  test('never downgrades a durable operation after restart or server rollback', async () => {
    const initial = {
      ...pair(1, now + 30_000),
      refreshRequestId: '00000000-0000-4000-8000-000000000001',
    };
    const { storage, transport } = setup(initial);
    const discover = vi.fn(async () => false);
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => now,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000002',
      supportsRefreshRequestId: discover,
    });
    await broker.refresh('recovery');
    expect(discover).not.toHaveBeenCalled();
    expect(transport.refresh).toHaveBeenCalledWith(
      'refresh-1',
      initial.refreshRequestId
    );
  });

  test('does not resurrect a session when sign-out races capability discovery', async () => {
    const { storage, transport, persisted } = setup(pair(1, now + 30_000));
    const discovery = deferred<boolean>();
    const started = deferred<void>();
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => now,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
      supportsRefreshRequestId: () => {
        started.resolve();
        return discovery.promise;
      },
    });
    const refreshing = broker.refresh('discover');
    await started.promise;
    await broker.clear('sign-out');
    discovery.resolve(true);
    await expect(refreshing).rejects.toMatchObject({
      code: 'AUTH_OPERATION_CANCELLED',
    });
    expect(transport.refresh).not.toHaveBeenCalled();
    expect(persisted()).toBeNull();
    expect(storage.save).not.toHaveBeenCalled();
  });

  test.each(['refresh', 'absolute'] as const)(
    'expires an unrecovered operation at its %s deadline without dispatch',
    async deadline => {
      const initial = pair(1, now + 30_000);
      initial.refreshRequestId = '00000000-0000-4000-8000-000000000001';
      if (deadline === 'refresh')
        initial.refreshExpiresAt = new Date(now).toISOString();
      else
        initial.session = {
          ...initial.session,
          absoluteExpiresAt: new Date(now).toISOString(),
        };
      const { storage, transport, persisted } = setup(initial);
      const broker = new AuthTokenBroker(storage, transport, {
        now: () => now,
        createRefreshRequestId: () => '00000000-0000-4000-8000-000000000002',
      });
      await expect(broker.refresh('expired-journal')).rejects.toMatchObject({
        code: 'AUTH_SESSION_EXPIRED',
        transient: false,
      });
      expect(transport.refresh).not.toHaveBeenCalled();
      expect(storage.save).not.toHaveBeenCalled();
      expect(persisted()).toBeNull();
    }
  );

  test('stops retries when the original credential expires during a network interruption', async () => {
    const initial = pair(1, now + 30_000);
    initial.refreshExpiresAt = new Date(now + 1000).toISOString();
    const { storage, transport, persisted } = setup(initial);
    let clock = now;
    transport.refresh.mockImplementation(async () => {
      clock += 2000;
      throw new AuthSessionError('NETWORK_ERROR', true);
    });
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      retryDelays: [0, 0],
      sleep: async () => {},
    });
    await expect(broker.refresh('expires-during-retry')).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
      transient: false,
    });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(persisted()).toBeNull();
  });

  test('does not prepare a journal if the credential expires during discovery', async () => {
    const initial = pair(1, now + 30_000);
    initial.refreshExpiresAt = new Date(now + 1000).toISOString();
    const { storage, transport } = setup(initial);
    let clock = now;
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
      supportsRefreshRequestId: async () => {
        clock += 2000;
        return true;
      },
    });
    await expect(
      broker.refresh('expires-during-discovery')
    ).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
    expect(transport.refresh).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  test('retains a valid persisted UUID v7 operation across initialization', async () => {
    const initial = pair(1, now + 600_000);
    initial.refreshRequestId = '019a4bc0-0000-7000-8000-000000000001';
    const { broker, storage } = setup(initial);
    await expect(broker.getValidAccessToken()).resolves.toBe('access-1');
    expect(storage.clear).not.toHaveBeenCalled();
  });

  test('backs off a rejected keyed operation without downgrading or discarding it', async () => {
    const { storage, transport, persisted } = setup(pair(1, now + 30_000));
    let clock = now;
    transport.refresh.mockRejectedValueOnce(
      new AuthSessionError('AUTH_SESSION_RECOVERY_UNSUPPORTED', false)
    );
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
    });
    for (let i = 0; i < 3; i++)
      await expect(broker.refresh('rollback')).rejects.toMatchObject({
        code: 'AUTH_SESSION_RECOVERY_UNSUPPORTED',
        transient: false,
      });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(persisted()?.refreshRequestId).toBe(
      '00000000-0000-4000-8000-000000000001'
    );
    clock += 30_000;
    await expect(broker.refresh('server-restored')).resolves.toMatchObject({
      accessToken: 'access-2',
    });
    expect(transport.refresh).toHaveBeenCalledTimes(2);
    expect(persisted()?.refreshRequestId).toBeUndefined();
  });

  test('a blocked operation still terminates at the original credential deadline', async () => {
    const initial = pair(1, now + 30_000);
    initial.refreshExpiresAt = new Date(now + 1000).toISOString();
    const { storage, transport, persisted } = setup(initial);
    let clock = now;
    transport.refresh.mockRejectedValue(
      new AuthSessionError('AUTH_SESSION_RECOVERY_UNSUPPORTED', false)
    );
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
    });
    await expect(broker.refresh('rollback')).rejects.toMatchObject({
      code: 'AUTH_SESSION_RECOVERY_UNSUPPORTED',
    });
    clock += 1000;
    await expect(broker.refresh('expired')).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
      transient: false,
    });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(persisted()).toBeNull();
  });

  test('persists an already received successor even if N expires while its save is retried', async () => {
    const initial = pair(1, now + 30_000);
    initial.refreshExpiresAt = new Date(now + 1000).toISOString();
    const { storage, transport, persisted } = setup(initial);
    const save = vi.mocked(storage.save).getMockImplementation()!;
    let failed = false;
    let clock = now;
    vi.mocked(storage.save).mockImplementation(async next => {
      if (next.refreshToken === 'refresh-2' && !failed) {
        failed = true;
        throw new Error('test storage unavailable');
      }
      await save(next);
    });
    transport.refresh.mockImplementationOnce(async () => {
      clock += 2000;
      return response(2);
    });
    const broker = new AuthTokenBroker(storage, transport, {
      now: () => clock,
      createRefreshRequestId: () => '00000000-0000-4000-8000-000000000001',
    });
    await expect(broker.refresh('received')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    await expect(broker.refresh('persist-only')).resolves.toMatchObject({
      accessToken: 'access-2',
    });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(persisted()?.refreshToken === 'refresh-2').toBe(true);
  });

  test('clears an explicitly unrecoverable credential instead of treating it as offline', async () => {
    const { broker, storage, transport } = setup(pair(1, now + 30_000));
    transport.refresh.mockRejectedValue(
      new AuthSessionError('AUTH_SESSION_RECOVERY_REQUIRED', false)
    );
    await expect(broker.refresh('unrecoverable')).rejects.toMatchObject({
      code: 'AUTH_SESSION_RECOVERY_REQUIRED',
      transient: false,
    });
    expect(transport.refresh).toHaveBeenCalledOnce();
    expect(storage.clear).toHaveBeenCalledOnce();
    await expect(broker.getValidAccessToken()).resolves.toBeNull();
  });

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

  test.each(['set', 'clear', 'revoke'] as const)(
    'allows explicit %s after initialization cannot read the old credential',
    async action => {
      const { broker, storage, transport, persisted } = setup(
        pair(1, now + 600_000)
      );
      vi.mocked(storage.load).mockRejectedValueOnce(new Error('locked'));
      const revoke = vi.fn(async () => {});

      if (action === 'set') {
        await expect(broker.set(response(2))).resolves.toMatchObject({
          accessToken: 'access-2',
        });
        expect(persisted()?.refreshToken).toBe('refresh-2');
        await expect(broker.getValidAccessToken(0)).resolves.toBe('access-2');
      } else {
        if (action === 'clear') {
          await expect(
            broker.clear('explicit-forget')
          ).resolves.toBeUndefined();
        } else {
          await expect(broker.revoke('logout', revoke)).rejects.toMatchObject({
            code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
          });
        }
        expect(persisted()).toBeNull();
        await expect(broker.getValidAccessToken(0)).resolves.toBeNull();
      }
      expect(storage.load).toHaveBeenCalledOnce();
      expect(transport.refresh).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    }
  );

  test.each(['set', 'clear'] as const)(
    'allows explicit %s while an in-flight initialization fails',
    async action => {
      const { broker, storage, transport, persisted } = setup(
        pair(1, now + 600_000)
      );
      const loaded = deferred<AuthTokenPair | null>();
      vi.mocked(storage.load).mockReturnValueOnce(loaded.promise);
      const reading = expect(
        broker.getValidAccessToken(0)
      ).rejects.toMatchObject({ code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE' });
      await vi.waitFor(() => expect(storage.load).toHaveBeenCalledOnce());
      const mutating = expect(
        action === 'set' ? broker.set(response(2)) : broker.clear('logout')
      ).resolves.toEqual(
        action === 'set'
          ? expect.objectContaining({ accessToken: 'access-2' })
          : undefined
      );
      loaded.reject(new Error('locked'));
      await reading;
      await mutating;
      await expect(broker.getValidAccessToken(0)).resolves.toBe(
        action === 'set' ? 'access-2' : null
      );
      expect(persisted()?.accessToken ?? null).toBe(
        action === 'set' ? 'access-2' : null
      );
      expect(transport.refresh).not.toHaveBeenCalled();
    }
  );

  test('validates a replacement before attempting to load or mutate storage', async () => {
    const { broker, storage, persisted } = setup(pair(1, now + 600_000));
    await expect(
      broker.set({ ...response(2), expiresIn: 0 })
    ).rejects.toMatchObject({ code: 'AUTH_TOKEN_RESPONSE_INVALID' });
    expect(storage.load).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(persisted()?.accessToken).toBe('access-1');
  });

  test('retries a new sign-in save without reloading an unreadable old credential', async () => {
    const { broker, storage, transport, persisted } = setup(
      pair(1, now + 600_000)
    );
    vi.mocked(storage.load).mockRejectedValueOnce(new Error('locked'));
    vi.mocked(storage.save).mockRejectedValueOnce(new Error('disk busy'));
    await expect(broker.set(response(2))).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    await expect(broker.getValidAccessToken(0)).resolves.toBe('access-2');
    expect(persisted()?.refreshToken).toBe('refresh-2');
    expect(storage.load).toHaveBeenCalledOnce();
    expect(transport.refresh).not.toHaveBeenCalled();
  });

  test('does not reload an old credential after explicit cleanup fails', async () => {
    const { broker, storage } = setup(pair(1, now + 600_000));
    vi.mocked(storage.load).mockRejectedValueOnce(new Error('locked'));
    vi.mocked(storage.clear).mockRejectedValueOnce(new Error('disk busy'));
    await expect(broker.clear('explicit-forget')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_STORAGE_UNAVAILABLE',
    });
    await expect(broker.getValidAccessToken(0)).resolves.toBeNull();
    expect(storage.load).toHaveBeenCalledOnce();
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
