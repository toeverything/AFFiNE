import { config, websocketPrefixUrl } from '@affine/env';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
  SQLiteDBDownloadProvider,
  SQLiteProvider,
} from '@affine/env/workspace';
import type { Disposable, DocProviderCreator } from '@blocksuite/store';
import { assertExists, Workspace } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import {
  createIndexedDBProvider as create,
  downloadBinary,
  EarlyDisconnectError,
} from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';

import { KeckProvider } from '../affine/keck';
import { getLoginStorage, storageChangeSlot } from '../affine/login';
import { CallbackSet } from '../utils';
import { createAffineDownloadProvider } from './affine-download';
import { localProviderLogger as logger } from './logger';

const Y = Workspace.Y;

const createAffineWebSocketProvider: DocProviderCreator = (
  id,
  doc,
  { awareness }
): AffineWebSocketProvider => {
  let webSocketProvider: KeckProvider | null = null;
  let dispose: Disposable | undefined = undefined;
  const callbacks = new CallbackSet();
  const cb = () => callbacks.forEach(cb => cb());
  const apis = {
    flavour: 'affine-websocket',
    passive: true,
    get connected() {
      return callbacks.ready;
    },
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
        id,
        doc,
        {
          params: { token: getLoginStorage()?.token ?? '' },
          awareness,
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
  } satisfies AffineWebSocketProvider;

  return apis;
};

const createIndexedDBBackgroundProvider: DocProviderCreator = (
  id,
  blockSuiteWorkspace
): LocalIndexedDBBackgroundProvider => {
  const indexeddbProvider = create(blockSuiteWorkspace);
  const callbacks = new CallbackSet();
  return {
    flavour: 'local-indexeddb-background',
    passive: true,
    get connected() {
      return callbacks.ready;
    },
    cleanup: () => {
      indexeddbProvider.cleanup().catch(console.error);
    },
    connect: () => {
      logger.info('connect indexeddb provider', id);
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
      logger.info('disconnect indexeddb provider', id);
      indexeddbProvider.disconnect();
      callbacks.ready = false;
    },
  };
};

const createIndexedDBDownloadProvider: DocProviderCreator = (
  id,
  doc
): LocalIndexedDBDownloadProvider => {
  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });
  async function downloadBinaryRecursively(doc: Doc) {
    const binary = await downloadBinary(doc.guid);
    if (binary) {
      Y.applyUpdate(doc, binary);
      await Promise.all([...doc.subdocs].map(downloadBinaryRecursively));
    }
  }
  return {
    flavour: 'local-indexeddb',
    active: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      // todo: cleanup data
    },
    sync: () => {
      logger.info('connect indexeddb provider', id);
      downloadBinaryRecursively(doc).then(_resolve).catch(_reject);
    },
  };
};

const sqliteOrigin = Symbol('sqlite-provider-origin');

const createSQLiteProvider: DocProviderCreator = (id, doc): SQLiteProvider => {
  const { apis, events } = window;
  // make sure it is being used in Electron with APIs
  assertExists(apis);
  assertExists(events);

  function handleUpdate(update: Uint8Array, origin: unknown) {
    if (origin === sqliteOrigin) {
      return;
    }
    apis.db.applyDocUpdate(id, update).catch(err => {
      console.error(err);
    });
  }

  let unsubscribe = () => {};
  let connected = false;

  const connect = () => {
    logger.info('connecting sqlite provider', id);
    doc.on('update', handleUpdate);
    unsubscribe = events.db.onExternalUpdate(
      ({
        update,
        workspaceId,
      }: {
        workspaceId: string;
        update: Uint8Array;
      }) => {
        if (workspaceId === id) {
          Y.applyUpdate(doc, update, sqliteOrigin);
        }
      }
    );
    connected = true;
    logger.info('connecting sqlite done', id);
  };

  const cleanup = () => {
    logger.info('disconnecting sqlite provider', id);
    unsubscribe();
    doc.off('update', handleUpdate);
    connected = false;
  };

  return {
    flavour: 'sqlite',
    passive: true,
    get connected(): boolean {
      return connected;
    },
    cleanup,
    connect,
    disconnect: cleanup,
  };
};

const createSQLiteDBDownloadProvider: DocProviderCreator = (
  id,
  doc
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
    logger.info('syncing updates from sqlite', id);
    const updates = await apis.db.getDocAsUpdates(id);

    if (disconnected) {
      return;
    }

    if (updates) {
      Y.applyUpdate(doc, updates, sqliteOrigin);
    }

    const diff = Y.encodeStateAsUpdate(doc, updates);

    // also apply updates to sqlite
    await apis.db.applyDocUpdate(id, diff);
  }

  // fixme(pengx17): should n't sync blob in doc provider
  // async function _syncBlobIntoSQLite(bs: BlobManager) {
  //   const persistedKeys = await apis.db.getBlobKeys(id);
  //
  //   if (disconnected) {
  //     return;
  //   }
  //
  //   const allKeys = await bs.list().catch(() => []);
  //   const keysToPersist = allKeys.filter(k => !persistedKeys.includes(k));
  //
  //   logger.info('persisting blobs', keysToPersist, 'to sqlite');
  //   return Promise.all(
  //     keysToPersist.map(async k => {
  //       const blob = await bs.get(k);
  //       if (!blob) {
  //         logger.warn('blob not found for', k);
  //         return;
  //       }
  //
  //       if (disconnected) {
  //         return;
  //       }
  //
  //       return apis?.db.addBlob(
  //         id,
  //         k,
  //         new Uint8Array(await blob.arrayBuffer())
  //       );
  //     })
  //   );
  // }

  return {
    flavour: 'sqlite-download',
    active: true,
    get whenReady() {
      return promise;
    },
    cleanup: () => {
      disconnected = true;
    },
    sync: async () => {
      logger.info('connect indexeddb provider', id);
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
  createBroadcastChannelProvider,
  createIndexedDBBackgroundProvider,
  createIndexedDBDownloadProvider,
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
};

export const createLocalProviders = (): DocProviderCreator[] => {
  const providers = [
    createIndexedDBBackgroundProvider,
    createIndexedDBDownloadProvider,
  ] as DocProviderCreator[];

  if (config.enableBroadcastChannelProvider) {
    providers.push(createBroadcastChannelProvider);
  }

  if (environment.isDesktop) {
    providers.push(createSQLiteProvider, createSQLiteDBDownloadProvider);
  }

  return providers;
};

export const createAffineProviders = (): DocProviderCreator[] => {
  return (
    [
      createAffineDownloadProvider,
      createAffineWebSocketProvider,
      config.enableBroadcastChannelProvider && createBroadcastChannelProvider,
      createIndexedDBDownloadProvider,
    ] as DocProviderCreator[]
  ).filter(v => Boolean(v));
};
