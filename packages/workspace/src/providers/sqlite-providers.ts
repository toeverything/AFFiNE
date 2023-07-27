import type {
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import {
  createLazyProvider,
  type DatasourceDocAdapter,
} from '@affine/y-provider';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import type { Doc } from 'yjs';

import { localProviderLogger as logger } from './logger';

const Y = BlockSuiteWorkspace.Y;

const sqliteOrigin = Symbol('sqlite-provider-origin');

const createDatasource = (workspaceId: string): DatasourceDocAdapter => {
  if (!window.apis?.db) {
    throw new Error('sqlite datasource is not available');
  }

  return {
    queryDocState: async guid => {
      return window.apis.db.getDocAsUpdates(
        workspaceId,
        workspaceId === guid ? undefined : guid
      );
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
  let datasource: ReturnType<typeof createDatasource> | null = null;
  let provider: ReturnType<typeof createLazyProvider> | null = null;
  let connected = false;
  return {
    flavour: 'sqlite',
    passive: true,
    connect: () => {
      datasource = createDatasource(id);
      provider = createLazyProvider(rootDoc, datasource, { origin: 'sqlite' });
      provider.connect();
      connected = true;
    },
    disconnect: () => {
      provider?.disconnect();
      datasource = null;
      provider = null;
      connected = false;
    },
    get connected() {
      return connected;
    },
  };
};

/**
 * A provider that is responsible for DOWNLOADING updates from the local SQLite database.
 */
export const createSQLiteDBDownloadProvider: DocProviderCreator = (
  id,
  rootDoc
): SQLiteDBDownloadProvider => {
  const { apis } = window;

  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  async function syncUpdates(doc: Doc) {
    logger.info('syncing updates from sqlite', doc.guid);
    const subdocId = doc.guid === id ? undefined : doc.guid;
    const updates = await apis.db.getDocAsUpdates(id, subdocId);

    if (updates) {
      Y.applyUpdate(doc, updates, sqliteOrigin);
    }

    return true;
  }

  return {
    flavour: 'sqlite-download',
    active: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      // todo
    },
    sync: async () => {
      logger.info('connect sqlite download provider', id);
      try {
        await syncUpdates(rootDoc);
        _resolve();
      } catch (error) {
        _reject(error);
      }
    },
  };
};
