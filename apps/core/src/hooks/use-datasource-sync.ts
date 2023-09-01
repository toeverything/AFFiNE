import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import { type Status, syncDataSource } from '@affine/y-provider';
import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import { startTransition, useCallback, useMemo, useState } from 'react';

export function useDatasourceSync(workspace: Workspace) {
  const [status, setStatus] = useState<Status>({
    type: 'idle',
  });
  const providers = workspace.providers;
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
  return [
    status,
    useCallback(() => {
      if (!remoteProvider) {
        return;
      }
      startTransition(() => {
        setStatus({
          type: 'syncing',
        });
      });
      syncDataSource(
        () => [
          workspace.doc.guid,
          ...[...workspace.doc.subdocs].map(doc => doc.guid),
        ],
        remoteProvider.datasource,
        localProvider.datasource
      )
        .then(() => {
          startTransition(() => {
            setStatus({
              type: 'synced',
            });
          });
        })
        .catch(error => {
          startTransition(() => {
            setStatus({
              type: 'error',
              error,
            });
          });
        });
    }, [
      remoteProvider,
      localProvider,
      workspace.doc.guid,
      workspace.doc.subdocs,
    ]),
  ] as const;
}
