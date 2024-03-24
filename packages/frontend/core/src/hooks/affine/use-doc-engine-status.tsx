import { useLiveData, useService, Workspace } from '@toeverything/infra';
import { useMemo } from 'react';

export function useDocEngineStatus() {
  const workspace = useService(Workspace);

  const engineState = useLiveData(workspace.engine.docEngineState$);

  const progress =
    (engineState.total - engineState.syncing) / engineState.total;

  return useMemo(
    () => ({
      ...engineState,
      progress,
      syncing: engineState.syncing > 0,
    }),
    [engineState, progress]
  );
}
