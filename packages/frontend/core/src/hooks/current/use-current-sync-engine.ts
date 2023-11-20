import type { SyncEngine, SyncEngineStatus } from '@affine/workspace/providers';
import { useEffect, useState } from 'react';

import { useCurrentWorkspace } from './use-current-workspace';

export function useCurrentSyncEngine(): SyncEngine | undefined {
  const [workspace] = useCurrentWorkspace();
  // FIXME: This is a hack to get the sync engine, we need refactor this in the future.
  const syncEngine = (
    workspace.blockSuiteWorkspace.providers[0] as { engine?: SyncEngine }
  )?.engine;

  return syncEngine;
}

export function useCurrentSyncEngineStatus(): SyncEngineStatus | undefined {
  const syncEngine = useCurrentSyncEngine();
  const [status, setStatus] = useState<SyncEngineStatus>();

  useEffect(() => {
    if (syncEngine) {
      setStatus(syncEngine.status);
      return syncEngine.onStatusChange.on(status => {
        setStatus(status);
      }).dispose;
    } else {
      setStatus(undefined);
    }
    return;
  }, [syncEngine]);

  return status;
}

/**
 *
 * @returns true if there are unsaved changes in the current workspace
 */
export function useHaveUnsavedChanges(): boolean {
  const syncEngine = useCurrentSyncEngine();
  const [haveUnsavedChanges, setHaveUnsavedChanges] = useState<boolean>(false);

  useEffect(() => {
    if (syncEngine) {
      setHaveUnsavedChanges(
        !!syncEngine.status.local &&
          syncEngine.status.local.pendingPushUpdates > 0
      );
      return syncEngine.onStatusChange.on(status => {
        setHaveUnsavedChanges(
          !!status.local && status.local.pendingPushUpdates > 0
        );
      }).dispose;
    } else {
      setHaveUnsavedChanges(false);
    }
    return;
  }, [syncEngine]);

  return haveUnsavedChanges;
}
