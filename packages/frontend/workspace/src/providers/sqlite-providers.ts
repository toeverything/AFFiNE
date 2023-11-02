import type { SQLiteProvider } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import type { DocProviderCreator } from '@blocksuite/store';
import { createLazyProvider, type DocDataSource } from 'y-provider';

const createDatasource = (workspaceId: string): DocDataSource => {
  if (!window.apis?.db) {
    throw new Error('sqlite datasource is not available');
  }

  return {
    queryDocState: async guid => {
      const update = await window.apis.db.getDocAsUpdates(
        workspaceId,
        workspaceId === guid ? undefined : guid
      );

      if (update) {
        return {
          missing: update,
        };
      }

      return false;
    },
    sendDocUpdate: async (guid, update) => {
      return window.apis.db.applyDocUpdate(
        workspaceId,
        update,
        workspaceId === guid ? undefined : guid
      );
    },
  };
};

/**
 * A provider that is responsible for syncing updates the workspace with the local SQLite database.
 */
export const createSQLiteProvider: DocProviderCreator = (
  id,
  rootDoc
): SQLiteProvider => {
  const datasource = createDatasource(id);
  let provider: ReturnType<typeof createLazyProvider> | null = null;

  let connected = false;
  const apis = {
    flavour: 'sqlite',
    datasource,
    passive: true,
    active: true,
    get status() {
      assertExists(provider);
      return provider.status;
    },
    subscribeStatusChange(onStatusChange) {
      assertExists(provider);
      return provider.subscribeStatusChange(onStatusChange);
    },
    connect: () => {
      provider = createLazyProvider(rootDoc, datasource, { origin: 'sqlite' });
      provider.connect();
      connected = true;
    },
    sync: () => {
      if (!provider) {
        apis.connect();
      }
      provider?.sync(true).catch(() => {
        /* noop */
      });
    },
    get whenReady() {
      return Promise.resolve(provider?.whenReady);
    },
    disconnect: () => {
      provider?.disconnect();
      provider = null;
      connected = false;
    },
    get connected() {
      return connected;
    },
  } satisfies SQLiteProvider;

  return apis;
};
