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
    plan: 'pro',
    seatLimit: 10,
    blobLimit: 1024,
    storageQuota: 2048,
    usedStorageQuota: 512,
    historyPeriodSeconds: 30 * 24 * 60 * 60,
    copilotActionLimit: undefined,
    unlimitedCopilot: false,
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
  test('projects user quota state', async () => {
    const store = createStore({
      fetchUserQuotaState: vi
        .fn()
        .mockResolvedValue(
          createQuotaState({ seatLimit: 9, usedStorageQuota: 512 })
        ),
    });
    const quota = createEntity(store);

    quota.revalidate();
    await vi.waitFor(() => expect(quota.used$.value).toBe(512));
    expect(quota.quota$.value?.humanReadable.historyPeriod).toBe('30 days');
    expect(quota.quota$.value?.memberLimit).toBe(9);
    expect(store.fetchUserQuotaState).toHaveBeenCalledTimes(1);
    expect(store.subscribeUserQuotaState).toHaveBeenCalledTimes(1);
    quota.dispose();
  });
});
