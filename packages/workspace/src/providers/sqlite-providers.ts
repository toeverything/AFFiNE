import type {
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import type { BlobManager } from '@blocksuite/store';
import {
  assertExists,
  Workspace as BlockSuiteWorkspace,
} from '@blocksuite/store';

import { CallbackSet } from '../utils';
import { localProviderLogger as logger } from './logger';

const Y = BlockSuiteWorkspace.Y;

const sqliteOrigin = Symbol('sqlite-provider-origin');

/**
 * A provider that is responsible for syncing updates the workspace with the local SQLite database.
 */
export const createSQLiteProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): SQLiteProvider => {
  const { apis, events } = window;
  // make sure it is being used in Electron with APIs
  assertExists(apis);
  assertExists(events);

  function handleUpdate(update: Uint8Array, origin: unknown) {
    if (origin === sqliteOrigin) {
      return;
    }
    apis.db.applyDocUpdate(blockSuiteWorkspace.id, update).catch(err => {
      console.error(err);
    });
  }

  let unsubscribe = () => {};
  let connected = false;

  const callbacks = new CallbackSet();

  const connect = () => {
    logger.info('connecting sqlite provider', blockSuiteWorkspace.id);
    blockSuiteWorkspace.doc.on('update', handleUpdate);
    unsubscribe = events.db.onExternalUpdate(
      ({
        update,
        workspaceId,
      }: {
        workspaceId: string;
        update: Uint8Array;
      }) => {
        if (workspaceId === blockSuiteWorkspace.id) {
          Y.applyUpdate(blockSuiteWorkspace.doc, update, sqliteOrigin);
        }
      }
    );
    connected = true;
    logger.info('connecting sqlite done', blockSuiteWorkspace.id);
  };

  const cleanup = () => {
    logger.info('disconnecting sqlite provider', blockSuiteWorkspace.id);
    unsubscribe();
    blockSuiteWorkspace.doc.off('update', handleUpdate);
    connected = false;
  };

  return {
    flavour: 'sqlite',
    background: true,
    callbacks,
    get connected(): boolean {
      return connected;
    },
    cleanup,
    connect,
    disconnect: cleanup,
  };
};

/**
 * A provider that is responsible for DOWNLOADING updates from the local SQLite database.
 */
export const createSQLiteDBDownloadProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): SQLiteDBDownloadProvider => {
  const { apis } = window;
  let disconnected = false;

  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  async function syncUpdates() {
    logger.info('syncing updates from sqlite', blockSuiteWorkspace.id);
    const updates = await apis.db.getDocAsUpdates(blockSuiteWorkspace.id);

    if (disconnected) {
      return;
    }

    if (updates) {
      Y.applyUpdate(blockSuiteWorkspace.doc, updates, sqliteOrigin);
    }

    const diff = Y.encodeStateAsUpdate(blockSuiteWorkspace.doc, updates);

    // also apply updates to sqlite
    await apis.db.applyDocUpdate(blockSuiteWorkspace.id, diff);

    const bs = blockSuiteWorkspace.blobs;

    if (bs && !disconnected) {
      await syncBlobIntoSQLite(bs);
    }
  }

  async function syncBlobIntoSQLite(bs: BlobManager) {
    const persistedKeys = await apis.db.getBlobKeys(blockSuiteWorkspace.id);

    if (disconnected) {
      return;
    }

    const allKeys = await bs.list().catch(() => []);
    const keysToPersist = allKeys.filter(k => !persistedKeys.includes(k));

    logger.info('persisting blobs', keysToPersist, 'to sqlite');
    return Promise.all(
      keysToPersist.map(async k => {
        const blob = await bs.get(k);
        if (!blob) {
          logger.warn('blob not found for', k);
          return;
        }

        if (disconnected) {
          return;
        }

        return apis?.db.addBlob(
          blockSuiteWorkspace.id,
          k,
          new Uint8Array(await blob.arrayBuffer())
        );
      })
    );
  }

  return {
    flavour: 'sqlite-download',
    necessary: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      disconnected = true;
    },
    sync: async () => {
      logger.info('connect indexeddb provider', blockSuiteWorkspace.id);
      try {
        await syncUpdates();
        _resolve();
      } catch (error) {
        _reject(error);
      }
    },
  };
};
