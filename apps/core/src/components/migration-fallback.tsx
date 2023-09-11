import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import {
  syncDataSourceFromDoc,
  syncDocFromDataSource,
} from '@affine/y-provider';
import { assertExists } from '@blocksuite/global/utils';
import { Button } from '@toeverything/components/button';
import { forceUpgradePages } from '@toeverything/infra/blocksuite';
import { useCallback, useMemo, useState } from 'react';

import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';

export const MigrationFallback = function MigrationFallback() {
  const [done, setDone] = useState(false);
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
  const handleClick = useCallback(async () => {
    setDone(false);
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
    setDone(true);
  }, [
    localProvider.datasource,
    remoteProvider,
    workspace.blockSuiteWorkspace.doc,
    workspace.blockSuiteWorkspace.schema,
  ]);
  if (done) {
    return <div>Done, please refresh the page.</div>;
  }
  return (
    <Button data-testid="upgrade-workspace" onClick={handleClick}>
      Upgrade Workspace
    </Button>
  );
};
