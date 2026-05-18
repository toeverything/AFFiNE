import type { GetCurrentUserProfileQuery } from '@affine/graphql';
import type { UserQuotaStateSnapshot } from '@affine/realtime';
import { Framework } from '@toeverything/infra';
import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AuthService } from '../services/auth';
import { UserQuotaStore } from '../stores/user-quota';
import { UserQuota } from './user-quota';

type Quota = NonNullable<GetCurrentUserProfileQuery['currentUser']>['quota'];

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

function createQuota(overrides: Partial<Quota> = {}): Quota {
  return {
    name: 'Legacy',
    blobLimit: 1024,
    storageQuota: 2048,
    historyPeriod: 30 * 24 * 60 * 60,
    memberLimit: 8,
    humanReadable: {
      name: 'Legacy',
      blobLimit: '1 KB',
      storageQuota: '2 KB',
      historyPeriod: '30 days',
      memberLimit: '8',
    },
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
    fetchUserQuota: vi.fn(),
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
    expect(store.fetchUserQuota).not.toHaveBeenCalled();
    quota.dispose();
  });

  test('falls back to legacy GraphQL quota when realtime request fails', async () => {
    const store = createStore({
      fetchUserQuotaState: vi.fn().mockRejectedValue(new Error('offline')),
      fetchUserQuota: vi.fn().mockResolvedValue({
        quota: createQuota(),
        used: 256,
      }),
    });
    const quota = createEntity(store);

    quota.revalidate();

    await vi.waitFor(() => expect(quota.quota$.value?.name).toBe('Legacy'));
    expect(quota.used$.value).toBe(256);
    quota.dispose();
  });
});
