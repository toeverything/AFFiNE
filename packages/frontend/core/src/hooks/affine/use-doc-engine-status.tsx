import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useMemo } from 'react';

export function useDocEngineStatus() {
  const workspace = useService(WorkspaceService).workspace;

  const engineState = useLiveData(
    workspace.engine.docEngineState$.throttleTime(100)
  );
  const progress =
    (engineState.total - engineState.syncing) / engineState.total;

  return useMemo(
    () => ({
      ...engineState,
      progress,
      syncing: engineState.syncing > 0 || engineState.retrying,
    }),
    [engineState, progress]
  );
}
