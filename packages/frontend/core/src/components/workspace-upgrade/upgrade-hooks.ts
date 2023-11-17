import { forceUpgradePages } from '@toeverything/infra/blocksuite';
import { useCallback, useState } from 'react';

import { useCurrentSyncEngine } from '../../hooks/current/use-current-sync-engine';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';

export type UpgradeState = 'pending' | 'upgrading' | 'done' | 'error';

export function useUpgradeWorkspace() {
  const [state, setState] = useState<UpgradeState>('pending');
  const [error, setError] = useState<Error | null>(null);

  const [workspace] = useCurrentWorkspace();
  const syncEngine = useCurrentSyncEngine();

  const upgradeWorkspace = useCallback(() => {
    setState('upgrading');
    setError(null);

    (async () => {
      await syncEngine?.waitForSynced();
      await forceUpgradePages({
        getCurrentRootDoc: async () => workspace.blockSuiteWorkspace.doc,
        getSchema: () => workspace.blockSuiteWorkspace.schema,
      });

      await syncEngine?.waitForSynced();

      setState('done');
    })().catch((e: any) => {
      console.error(e);
      setError(e);
      setState('error');
    });
  }, [
    workspace.blockSuiteWorkspace.doc,
    workspace.blockSuiteWorkspace.schema,
    syncEngine,
  ]);

  return [state, error, upgradeWorkspace] as const;
}
