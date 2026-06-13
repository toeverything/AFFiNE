import { WorkspaceService } from '@affine/core/modules/workspace';
import type { WorkspaceQuotaStateSnapshot } from '@affine/realtime';
import { Framework } from '@toeverything/infra';
import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { WorkspaceQuotaStore } from '../stores/quota';
import { WorkspaceQuota } from './quota';

const workspaceService = {
  workspace: { id: 'workspace-1' },
} as unknown as WorkspaceService;

function createQuotaState(
  overrides: Partial<WorkspaceQuotaStateSnapshot> = {}
): WorkspaceQuotaStateSnapshot {
  return {
    workspaceId: 'workspace-1',
    plan: 'Team',
    sourceEntitlementId: 'entitlement-1',
    ownerUserId: 'user-1',
    usesOwnerQuota: false,
    seatLimit: 10,
    memberCount: 3,
    overcapacityMemberCount: 0,
    blobLimit: 1024,
    storageQuota: 2048,
    usedStorageQuota: 512,
    historyPeriodSeconds: 30 * 24 * 60 * 60,
    readonly: false,
    readonlyReasons: [],
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
  overrides: Partial<WorkspaceQuotaStore>,
  eventSubject = new Subject<{ type: 'ready' } | { changed: true }>()
) {
  return {
    fetchWorkspaceQuotaState: vi.fn(),
    subscribeWorkspaceQuotaState: vi.fn(() => eventSubject),
    ...overrides,
  } as unknown as WorkspaceQuotaStore;
}

function createEntity(store: WorkspaceQuotaStore) {
  const framework = new Framework();
  framework
    .service(WorkspaceService, workspaceService)
    .store(WorkspaceQuotaStore, store)
    .entity(WorkspaceQuota, [WorkspaceService, WorkspaceQuotaStore]);

  return framework.provider().createEntity(WorkspaceQuota);
}

describe('WorkspaceQuota', () => {
  test('uses realtime quota state snapshots and refreshes on quota events', async () => {
    const events$ = new Subject<{ type: 'ready' } | { changed: true }>();
    const store = createStore(
      {
        fetchWorkspaceQuotaState: vi
          .fn()
          .mockResolvedValueOnce(createQuotaState({ memberCount: 3 }))
          .mockResolvedValueOnce(createQuotaState({ memberCount: 4 })),
      },
      events$
    );
    const quota = createEntity(store);

    quota.revalidate();
    await vi.waitFor(() => expect(quota.quota$.value?.memberCount).toBe(3));
    expect(quota.quota$.value?.humanReadable.historyPeriod).toBe('30 days');

    events$.next({ changed: true });
    await vi.waitFor(() => expect(quota.quota$.value?.memberCount).toBe(4));

    expect(store.fetchWorkspaceQuotaState).toHaveBeenCalledTimes(2);
    quota.dispose();
  });

  test('surfaces realtime quota errors without GraphQL fallback', async () => {
    const error = new Error('offline');
    const store = createStore({
      fetchWorkspaceQuotaState: vi.fn().mockRejectedValue(error),
    });
    const quota = createEntity(store);

    quota.revalidate();

    await vi.waitFor(() => expect(quota.error$.value).toBe(error));
    expect(quota.quota$.value).toBeNull();
    quota.dispose();
  });
});
