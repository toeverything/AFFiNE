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
    plan: 'Team',
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
    unlimitedCopilot: false,
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
  test('projects workspace quota state', async () => {
    const store = createStore({
      fetchWorkspaceQuotaState: vi
        .fn()
        .mockResolvedValue(createQuotaState({ memberCount: 3 })),
    });
    const quota = createEntity(store);

    quota.revalidate();
    await vi.waitFor(() => expect(quota.quota$.value?.memberCount).toBe(3));
    expect(quota.quota$.value?.humanReadable.historyPeriod).toBe('30 days');
    expect(store.fetchWorkspaceQuotaState).toHaveBeenCalledWith(
      'workspace-1',
      expect.any(AbortSignal)
    );
    expect(store.subscribeWorkspaceQuotaState).toHaveBeenCalledWith(
      'workspace-1'
    );
    quota.dispose();
  });
});
