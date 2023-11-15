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
