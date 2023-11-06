import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { forceUpgradePages } from '@toeverything/infra/blocksuite';
import { useCallback, useMemo, useState } from 'react';
import { syncDataSourceFromDoc, syncDocFromDataSource } from 'y-provider';

import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';

export type UpgradeState = 'pending' | 'upgrading' | 'done' | 'error';

export function useUpgradeWorkspace() {
  const [state, setState] = useState<UpgradeState>('pending');
  const [error, setError] = useState<Error | null>(null);

  const [workspace] = useCurrentWorkspace();
  const providers = workspace.blockSuiteWorkspace.providers;
  const remoteProvider: AffineSocketIOProvider | undefined = useMemo(() => {
    return providers.find(
      (provider): provider is AffineSocketIOProvider =>
        provider.flavour === 'affine-socket-io'
    );
  }, [providers]);
  const localProvider = useMemo(() => {
    const sqliteProvider = providers.find(
      (provider): provider is SQLiteProvider => provider.flavour === 'sqlite'
    );
    const indexedDbProvider = providers.find(
      (provider): provider is LocalIndexedDBBackgroundProvider =>
        provider.flavour === 'local-indexeddb-background'
    );
    const provider = sqliteProvider || indexedDbProvider;
    assertExists(provider, 'no local provider');
    return provider;
  }, [providers]);

  const upgradeWorkspace = useCallback(() => {
    setState('upgrading');
    setError(null);

    (async () => {
      await syncDocFromDataSource(
        workspace.blockSuiteWorkspace.doc,
        localProvider.datasource
      );
      if (remoteProvider) {
        await syncDocFromDataSource(
          workspace.blockSuiteWorkspace.doc,
          remoteProvider.datasource
        );
      }

      await forceUpgradePages({
        getCurrentRootDoc: async () => workspace.blockSuiteWorkspace.doc,
        getSchema: () => workspace.blockSuiteWorkspace.schema,
      });
      await syncDataSourceFromDoc(
        workspace.blockSuiteWorkspace.doc,
        localProvider.datasource
      );
      if (remoteProvider) {
        await syncDataSourceFromDoc(
          workspace.blockSuiteWorkspace.doc,
          remoteProvider.datasource
        );
      }

      setState('done');
    })().catch((e: any) => {
      console.error(e);
      setError(e);
      setState('error');
    });
  }, [
    localProvider.datasource,
    remoteProvider,
    workspace.blockSuiteWorkspace.doc,
    workspace.blockSuiteWorkspace.schema,
  ]);

  return [state, error, upgradeWorkspace] as const;
}
