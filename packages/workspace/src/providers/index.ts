import { config, websocketPrefixUrl } from '@affine/env';
import { KeckProvider } from '@affine/workspace/affine/keck';
import {
  getLoginStorage,
  storageChangeSlot,
} from '@affine/workspace/affine/login';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
  Provider,
  SQLiteProvider,
} from '@affine/workspace/type';
import { CallbackSet } from '@affine/workspace/utils';
import type { BlobManager, Disposable } from '@blocksuite/store';
import {
  assertExists,
  Workspace as BlockSuiteWorkspace,
} from '@blocksuite/store';
import {
  createIndexedDBProvider as create,
  downloadBinary,
  EarlyDisconnectError,
} from '@toeverything/y-indexeddb';

import { createBroadCastChannelProvider } from './broad-cast-channel';
import { localProviderLogger as logger } from './logger';

const Y = BlockSuiteWorkspace.Y;

const createAffineWebSocketProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): AffineWebSocketProvider => {
  let webSocketProvider: KeckProvider | null = null;
  let dispose: Disposable | undefined = undefined;
  const callbacks = new CallbackSet();
  const cb = () => callbacks.forEach(cb => cb());
  const apis: AffineWebSocketProvider = {
    flavour: 'affine-websocket',
    background: true,
    get connected() {
      return callbacks.ready;
    },
    callbacks,
    cleanup: () => {
      assertExists(webSocketProvider);
      webSocketProvider.destroy();
      webSocketProvider = null;
      dispose?.dispose();
    },
    connect: () => {
      dispose = storageChangeSlot.on(() => {
        apis.disconnect();
        apis.connect();
      });
      webSocketProvider = new KeckProvider(
        websocketPrefixUrl + '/api/sync/',
        blockSuiteWorkspace.id,
        blockSuiteWorkspace.doc,
        {
          params: { token: getLoginStorage()?.token ?? '' },
          awareness: blockSuiteWorkspace.awarenessStore.awareness,
          // we maintain a broadcast channel by ourselves
          connect: false,
        }
      );
      logger.info('connect', webSocketProvider.url);
      webSocketProvider.on('synced', cb);
      webSocketProvider.connect();
    },
    disconnect: () => {
      assertExists(webSocketProvider);
      logger.info('disconnect', webSocketProvider.url);
      webSocketProvider.disconnect();
      webSocketProvider.off('synced', cb);
      dispose?.dispose();
    },
  };

  return apis;
};

const createIndexedDBBackgroundProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): LocalIndexedDBBackgroundProvider => {
  const indexeddbProvider = create(
    blockSuiteWorkspace.id,
    blockSuiteWorkspace.doc
  );
  const callbacks = new CallbackSet();
  return {
    flavour: 'local-indexeddb-background',
    background: true,
    get connected() {
      return callbacks.ready;
    },
    callbacks,
    cleanup: () => {
      // todo: cleanup data
    },
    connect: () => {
      logger.info('connect indexeddb provider', blockSuiteWorkspace.id);
      indexeddbProvider.connect();
      indexeddbProvider.whenSynced
        .then(() => {
          callbacks.ready = true;
          callbacks.forEach(cb => cb());
        })
        .catch(error => {
          callbacks.ready = false;
          if (error instanceof EarlyDisconnectError) {
            return;
          } else {
            throw error;
          }
        });
    },
    disconnect: () => {
      assertExists(indexeddbProvider);
      logger.info('disconnect indexeddb provider', blockSuiteWorkspace.id);
      indexeddbProvider.disconnect();
      callbacks.ready = false;
    },
  };
};

const createIndexedDBDownloadProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): LocalIndexedDBDownloadProvider => {
  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });
  return {
    flavour: 'local-indexeddb',
    necessary: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      // todo: cleanup data
    },
    sync: () => {
      logger.info('connect indexeddb provider', blockSuiteWorkspace.id);
      downloadBinary(blockSuiteWorkspace.id)
        .then(binary => {
          if (binary !== false) {
            Y.applyUpdate(blockSuiteWorkspace.doc, binary);
          }
          _resolve();
        })
        .catch(error => {
          _reject(error);
        });
    },
  };
};

const createSQLiteProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): SQLiteProvider => {
  const sqliteOrigin = Symbol('sqlite-provider-origin');
  const apis = window.apis!;
  const events = window.events!;
  // make sure it is being used in Electron with APIs
  assertExists(apis);
  assertExists(events);

  function handleUpdate(update: Uint8Array, origin: unknown) {
    if (origin === sqliteOrigin) {
      return;
    }
    apis.db.applyDocUpdate(blockSuiteWorkspace.id, update);
  }

  async function syncBlobIntoSQLite(bs: BlobManager) {
    const persistedKeys = await apis.db.getPersistedBlobs(
      blockSuiteWorkspace.id
    );

    const allKeys = await bs.list();
    const keysToPersist = allKeys.filter(k => !persistedKeys.includes(k));

    logger.info('persisting blobs', keysToPersist, 'to sqlite');
    return Promise.all(
      keysToPersist.map(async k => {
        const blob = await bs.get(k);
        if (!blob) {
          logger.warn('blob not found for', k);
          return;
        }
        return window.apis?.db.addBlob(
          blockSuiteWorkspace.id,
          k,
          new Uint8Array(await blob.arrayBuffer())
        );
      })
    );
  }

  async function syncUpdates() {
    logger.info('syncing updates from sqlite', blockSuiteWorkspace.id);
    const updates = await apis.db.getDocAsUpdates(blockSuiteWorkspace.id);

    if (updates) {
      Y.applyUpdate(blockSuiteWorkspace.doc, updates, sqliteOrigin);
    }

    const mergeUpdates = Y.encodeStateAsUpdate(blockSuiteWorkspace.doc);

    // also apply updates to sqlite
    apis.db.applyDocUpdate(blockSuiteWorkspace.id, mergeUpdates);

    const bs = blockSuiteWorkspace.blobs;

    if (bs) {
      // this can be non-blocking
      syncBlobIntoSQLite(bs);
    }
  }

  let unsubscribe = () => {};
  let connected = false;
  const callbacks = new CallbackSet();

  return {
    flavour: 'sqlite',
    background: true,
    callbacks,
    get connected(): boolean {
      return connected;
    },
    cleanup: () => {
      throw new Error('Method not implemented.');
    },
    connect: async () => {
      logger.info('connecting sqlite provider', blockSuiteWorkspace.id);
      await syncUpdates();
      connected = true;

      blockSuiteWorkspace.doc.on('update', handleUpdate);

      let timer = 0;
      unsubscribe = events.db.onDbFileUpdate(workspaceId => {
        if (workspaceId === blockSuiteWorkspace.id) {
          // throttle
          logger.debug('on db update', workspaceId);
          if (timer) {
            clearTimeout(timer);
          }

          // @ts-expect-error ignore the type
          timer = setTimeout(() => {
            syncUpdates();
            timer = 0;
          }, 1000);
        }
      });

      // blockSuiteWorkspace.doc.on('destroy', ...);
      logger.info('connecting sqlite done', blockSuiteWorkspace.id);
    },
    disconnect: () => {
      unsubscribe();
      blockSuiteWorkspace.doc.off('update', handleUpdate);
      connected = false;
    },
  };
};

export {
  createAffineWebSocketProvider,
  createBroadCastChannelProvider,
  createIndexedDBBackgroundProvider,
  createIndexedDBDownloadProvider,
  createSQLiteProvider,
};

export const createLocalProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      config.enableBroadCastChannelProvider &&
        createBroadCastChannelProvider(blockSuiteWorkspace),
      createIndexedDBBackgroundProvider(blockSuiteWorkspace),
      createIndexedDBDownloadProvider(blockSuiteWorkspace),
      environment.isDesktop && createSQLiteProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};
