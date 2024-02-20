import { syncEngineStatusAtom } from '@affine/core/atoms/sync-engine-status';
import { useAtom } from 'jotai';
import { mean } from 'lodash-es';
import { useMemo } from 'react';

export function useSyncEngineStatus() {
  const [syncEngineStatus, setSyncEngineStatus] = useAtom(syncEngineStatusAtom);

  const progress = useMemo(() => {
    if (!syncEngineStatus?.remotes || syncEngineStatus?.remotes.length === 0) {
      return null;
    }
    return mean(
      syncEngineStatus.remotes.map(peer => {
        if (!peer) {
          return 0;
        }
        const totalTask =
          peer.totalDocs + peer.pendingPullUpdates + peer.pendingPushUpdates;
        const doneTask = peer.loadedDocs;

        return doneTask / totalTask;
      })
    );
  }, [syncEngineStatus?.remotes]);

  return useMemo(
    () => ({
      syncEngineStatus,
      setSyncEngineStatus,
      progress,
    }),
    [progress, setSyncEngineStatus, syncEngineStatus]
  );
}
