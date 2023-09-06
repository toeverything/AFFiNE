import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { Button } from '@toeverything/components/button';
import { forceUpgradePages } from '@toeverything/infra/blocksuite';
import { useCallback, useMemo, useState } from 'react';
import type { Doc as YDoc } from 'yjs';
import { applyUpdate, encodeStateAsUpdate, encodeStateVector } from 'yjs';

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
    const downloadRecursively = async (doc: YDoc) => {
      {
        const docState = await localProvider.datasource.queryDocState(
          doc.guid,
          {
            stateVector: encodeStateVector(doc),
          }
        );
        console.log('download indexeddb', doc.guid);
        if (docState) {
          applyUpdate(doc, docState.missing, 'migration');
        }
      }
      if (remoteProvider) {
        {
          const docState = await remoteProvider.datasource.queryDocState(
            doc.guid,
            {
              stateVector: encodeStateVector(doc),
            }
          );
          console.log('download remote', doc.guid);
          if (docState) {
            applyUpdate(doc, docState.missing, 'migration');
          }
        }
      }
      await Promise.all(
        [...doc.subdocs].map(async subdoc => {
          await downloadRecursively(subdoc);
        })
      );
      {
        await localProvider.datasource.sendDocUpdate(
          doc.guid,
          encodeStateAsUpdate(doc)
        );
        console.log('upload indexeddb', doc.guid);
        if (remoteProvider) {
          await remoteProvider.datasource.sendDocUpdate(
            doc.guid,
            encodeStateAsUpdate(doc)
          );
          console.log('upload remote', doc.guid);
        }
      }
    };

    await downloadRecursively(workspace.blockSuiteWorkspace.doc);
    console.log('download done');

    console.log('start migration');
    await forceUpgradePages({
      getCurrentRootDoc: async () => workspace.blockSuiteWorkspace.doc,
      getSchema: () => workspace.blockSuiteWorkspace.schema,
    });
    console.log('migration done');
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
