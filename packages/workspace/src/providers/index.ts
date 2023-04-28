import { config, websocketPrefixUrl } from '@affine/env';
import { KeckProvider } from '@affine/workspace/affine/keck';
import {
  getLoginStorage,
  storageChangeSlot,
} from '@affine/workspace/affine/login';
import type { Provider, SQLiteProvider } from '@affine/workspace/type';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBProvider,
} from '@affine/workspace/type';
import type { BlobManager, Disposable } from '@blocksuite/store';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import {
  createIndexedDBProvider as create,
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
  const apis: AffineWebSocketProvider = {
    flavour: 'affine-websocket',
    background: false,
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
          // we maintain broadcast channel by ourselves
          // @ts-expect-error
          disableBc: true,
          connect: false,
        }
      );
      logger.info('connect', webSocketProvider.url);
      webSocketProvider.connect();
    },
    disconnect: () => {
      assertExists(webSocketProvider);
      logger.info('disconnect', webSocketProvider.url);
      webSocketProvider.destroy();
      webSocketProvider = null;
      dispose?.dispose();
    },
  };

  return apis;
};

class CallbackSet extends Set<() => void> {
  #ready = false;

  get ready(): boolean {
    return this.#ready;
  }

  set ready(v: boolean) {
    this.#ready = v;
  }

  add(cb: () => void) {
    if (this.ready) {
      cb();
      return this;
    }
    if (this.has(cb)) {
      return this;
    }
    return super.add(cb);
  }

  delete(cb: () => void) {
    if (this.has(cb)) {
      return super.delete(cb);
    }
    return false;
  }
}

const createIndexedDBProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): LocalIndexedDBProvider => {
  const indexeddbProvider = create(
    blockSuiteWorkspace.id,
    blockSuiteWorkspace.doc
  );
  const callbacks = new CallbackSet();
  return {
    flavour: 'local-indexeddb',
    // fixme: remove callbacks
    callbacks,
    // fixme: remove whenSynced
    whenSynced: indexeddbProvider.whenSynced,
    // fixme: remove background long polling
    background: true,
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

const createSQLiteProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): SQLiteProvider => {
  const sqliteOrigin = Symbol('sqlite-provider-origin');
  // make sure it is being used in Electron with APIs
  assertExists(environment.isDesktop && window.apis);

  function handleUpdate(update: Uint8Array, origin: unknown) {
    if (origin === sqliteOrigin) {
      return;
    }
    window.apis.db.applyDocUpdate(blockSuiteWorkspace.id, update);
  }

  async function syncBlobIntoSQLite(bs: BlobManager) {
    const persistedKeys = await window.apis.db.getPersistedBlobs(
      blockSuiteWorkspace.id
    );

    const allKeys = await bs.list();
    const keysToPersist = allKeys.filter(k => !persistedKeys.includes(k));

    logger.info('persisting blobs', keysToPersist, 'to sqlite');
    keysToPersist.forEach(async k => {
      const blob = await bs.get(k);
      if (!blob) {
        logger.warn('blob not found for', k);
        return;
      }
      window.apis.db.addBlob(
        blockSuiteWorkspace.id,
        k,
        new Uint8Array(await blob.arrayBuffer())
      );
    });
  }

  async function syncUpdates() {
    logger.info('syncing updates from sqlite', blockSuiteWorkspace.id);
    const updates = await window.apis.db.getDoc(blockSuiteWorkspace.id);

    if (updates) {
      Y.applyUpdate(blockSuiteWorkspace.doc, updates, sqliteOrigin);
    }

    const mergeUpdates = Y.encodeStateAsUpdate(blockSuiteWorkspace.doc);

    // also apply updates to sqlite
    window.apis.db.applyDocUpdate(blockSuiteWorkspace.id, mergeUpdates);

    const bs = blockSuiteWorkspace.blobs;

    if (bs) {
      // this can be non-blocking
      syncBlobIntoSQLite(bs);
    }
  }

  let unsubscribe = () => {};

  const provider = {
    flavour: 'sqlite',
    background: true,
    cleanup: () => {
      throw new Error('Method not implemented.');
    },
    connect: async () => {
      logger.info('connecting sqlite provider', blockSuiteWorkspace.id);
      await syncUpdates();

      blockSuiteWorkspace.doc.on('update', handleUpdate);

      let timer = 0;
      unsubscribe = window.apis.db.onDBUpdate(workspaceId => {
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
    },
  } satisfies SQLiteProvider;

  return provider;
};

export {
  createAffineWebSocketProvider,
  createBroadCastChannelProvider,
  createIndexedDBProvider,
  createSQLiteProvider,
};

export const createLocalProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      config.enableBroadCastChannelProvider &&
        createBroadCastChannelProvider(blockSuiteWorkspace),
      createIndexedDBProvider(blockSuiteWorkspace),
      environment.isDesktop && createSQLiteProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};
