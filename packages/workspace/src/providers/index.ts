import { config, websocketPrefixUrl } from '@affine/env';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
  Provider,
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
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

import { KeckProvider } from '../affine/keck';
import { getLoginStorage, storageChangeSlot } from '../affine/login';
import { CallbackSet } from '../utils';
import { createAffineDownloadProvider } from './affine-download';
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
  const indexeddbProvider = create(blockSuiteWorkspace.doc);
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

const sqliteOrigin = Symbol('sqlite-provider-origin');

const createSQLiteProvider = (
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

const createSQLiteDBDownloadProvider = (
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

export {
  createAffineDownloadProvider,
  createAffineWebSocketProvider,
  createBroadCastChannelProvider,
  createIndexedDBBackgroundProvider,
  createIndexedDBDownloadProvider,
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
};

export const createLocalProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  const providers = [
    createIndexedDBBackgroundProvider(blockSuiteWorkspace),
    createIndexedDBDownloadProvider(blockSuiteWorkspace),
  ] as Provider[];

  if (config.enableBroadCastChannelProvider) {
    providers.push(createBroadCastChannelProvider(blockSuiteWorkspace));
  }

  if (environment.isDesktop) {
    providers.push(
      createSQLiteProvider(blockSuiteWorkspace),
      createSQLiteDBDownloadProvider(blockSuiteWorkspace)
    );
  }

  return providers;
};

export const createAffineProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      createAffineDownloadProvider(blockSuiteWorkspace),
      createAffineWebSocketProvider(blockSuiteWorkspace),
      config.enableBroadCastChannelProvider &&
        createBroadCastChannelProvider(blockSuiteWorkspace),
      createIndexedDBDownloadProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};
