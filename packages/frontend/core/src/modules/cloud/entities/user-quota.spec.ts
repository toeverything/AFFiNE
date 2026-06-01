import type { UserQuotaStateSnapshot } from '@affine/realtime';
import { Framework } from '@toeverything/infra';
import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AuthService } from '../services/auth';
import { UserQuotaStore } from '../stores/user-quota';
import { UserQuota } from './user-quota';

const authService = {
  session: {
    ['account$']: {
      value: { id: 'user-1' },
    },
  },
} as unknown as AuthService;

function createQuotaState(
  overrides: Partial<UserQuotaStateSnapshot> = {}
): UserQuotaStateSnapshot {
  return {
    userId: 'user-1',
    plan: 'pro',
    sourceEntitlementId: 'entitlement-1',
    blobLimit: 1024,
    storageQuota: 2048,
    usedStorageQuota: 512,
    historyPeriodSeconds: 30 * 24 * 60 * 60,
    copilotActionLimit: null,
    flags: {},
    known: true,
    stale: false,
    lastReconciledAt: null,
    staleAfter: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function createStore(
  overrides: Partial<UserQuotaStore>,
  eventSubject = new Subject<{ type: 'ready' } | { changed: true }>()
) {
  return {
    fetchUserQuotaState: vi.fn(),
    subscribeUserQuotaState: vi.fn(() => eventSubject),
    ...overrides,
  } as unknown as UserQuotaStore;
}

function createEntity(store: UserQuotaStore) {
  const framework = new Framework();
  framework
    .service(AuthService, authService)
    .store(UserQuotaStore, store)
    .entity(UserQuota, [AuthService, UserQuotaStore]);

  return framework.provider().createEntity(UserQuota);
}

describe('UserQuota', () => {
  test('uses realtime quota state snapshots and refreshes on quota events', async () => {
    const events$ = new Subject<{ type: 'ready' } | { changed: true }>();
    const store = createStore(
      {
        fetchUserQuotaState: vi
          .fn()
          .mockResolvedValueOnce(createQuotaState({ usedStorageQuota: 512 }))
          .mockResolvedValueOnce(createQuotaState({ usedStorageQuota: 768 })),
      },
      events$
    );
    const quota = createEntity(store);

    quota.revalidate();
    await vi.waitFor(() => expect(quota.used$.value).toBe(512));
    expect(quota.quota$.value?.humanReadable.historyPeriod).toBe('30 days');

    events$.next({ changed: true });
    await vi.waitFor(() => expect(quota.used$.value).toBe(768));

    expect(store.fetchUserQuotaState).toHaveBeenCalledTimes(2);
    quota.dispose();
  });

  test('surfaces realtime quota errors without GraphQL fallback', async () => {
    const error = new Error('offline');
    const store = createStore({
      fetchUserQuotaState: vi.fn().mockRejectedValue(error),
    });
    const quota = createEntity(store);

    quota.revalidate();

    await vi.waitFor(() => expect(quota.error$.value).toBe(error));
    expect(quota.quota$.value).toBeNull();
    quota.dispose();
  });
});
