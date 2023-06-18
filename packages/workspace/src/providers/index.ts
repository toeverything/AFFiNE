import { config, websocketPrefixUrl } from '@affine/env';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
  Provider,
} from '@affine/env/workspace';
import type { Disposable } from '@blocksuite/store';
import {
  assertExists,
  Workspace as BlockSuiteWorkspace,
} from '@blocksuite/store';
import {
  createIndexedDBProvider,
  downloadBinary,
  EarlyDisconnectError,
} from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';

import { KeckProvider } from '../affine/keck';
import { getLoginStorage, storageChangeSlot } from '../affine/login';
import { CallbackSet } from '../utils';
import { createAffineDownloadProvider } from './affine-download';
import { createBroadCastChannelProvider } from './broad-cast-channel';
import { localProviderLogger as logger } from './logger';
import {
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
} from './sqlite-providers';

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
  const indexeddbProvider = createIndexedDBProvider(blockSuiteWorkspace.doc);
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

  async function loadDocFromIDB(doc: Doc) {
    const binary = await downloadBinary(doc.guid);
    if (binary !== false) {
      Y.applyUpdate(doc, binary);
      // load event will
      // - change isLoaded to true
      // - resolve doc.whenLoaded
      doc.emit('load', []);
      return true;
    }
    return false;
  }

  // load root & shouldLoad subdocs
  async function loadAllDocFromIDB(doc: Doc) {
    if (await loadDocFromIDB(doc)) {
      // hmm, subdoc may not have children subdoc as well?
      const subdocs = Array.from(doc.subdocs).filter(
        subdoc => subdoc.shouldLoad
      );
      await Promise.all(subdocs.map(loadDocFromIDB));
    }
  }

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
      logger.info(
        'connect indexeddb download provider',
        blockSuiteWorkspace.id
      );
      loadAllDocFromIDB(blockSuiteWorkspace.doc)
        .then(() => {
          _resolve();
        })
        .catch(error => {
          _reject(error);
        });
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
