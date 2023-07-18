import { DebugLogger } from '@affine/debug';
import type {
  DocProviderCreator,
  LazyDocProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
} from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { Workspace } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import {
  createIndexedDBProvider as create,
  createIndexedDBProvider2,
  downloadBinary,
  EarlyDisconnectError,
} from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';

import {
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
} from './sqlite-providers';

const Y = Workspace.Y;
const logger = new DebugLogger('indexeddb-provider');

const createIndexedDBBackgroundProvider: DocProviderCreator = (
  id,
  doc
): LocalIndexedDBBackgroundProvider => {
  const indexeddbProvider = create(doc);
  let connected = false;
  return {
    flavour: 'local-indexeddb-background',
    passive: true,
    get connected() {
      return connected;
    },
    cleanup: () => {
      indexeddbProvider.cleanup().catch(console.error);
    },
    connect: () => {
      logger.info('connect indexeddb provider', id);
      indexeddbProvider.connect();
      indexeddbProvider.whenSynced
        .then(() => {
          connected = true;
        })
        .catch(error => {
          connected = false;
          if (error instanceof EarlyDisconnectError) {
            return;
          }
          throw error;
        });
    },
    disconnect: () => {
      assertExists(indexeddbProvider);
      logger.info('disconnect indexeddb provider', id);
      indexeddbProvider.disconnect();
      connected = false;
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
  async function downloadAndApply(doc: Doc) {
    logger.debug('idb: downloadAndApply', doc.guid);
    const binary = await downloadBinary(doc.guid);
    if (binary) {
      Y.applyUpdate(doc, binary);
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
      logger.info('sync indexeddb provider', id);
      downloadAndApply(doc).then(_resolve).catch(_reject);
    },
  };
};

const createIndexedDBLazyProvider: DocProviderCreator = (
  id,
  rootDoc
): LazyDocProvider => {
  const indexeddbProvider = createIndexedDBProvider2(rootDoc);
  return {
    flavour: 'local-indexeddb-lazy',
    lazy: true,
    connect: (guid: string) => {
      logger.info('connect indexeddb lazy provider', id);
      indexeddbProvider.connect(guid);
    },
    disconnect: (guid: string) => {
      logger.info('disconnect indexeddb provider', id);
      indexeddbProvider?.disconnect(guid);
    },
  };
};

export {
  createBroadcastChannelProvider,
  createIndexedDBBackgroundProvider,
  createIndexedDBDownloadProvider,
  createIndexedDBLazyProvider,
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
};

export const createLocalProviders = (): DocProviderCreator[] => {
  const providers = !runtimeConfig.enableLazyProvider
    ? [createIndexedDBBackgroundProvider, createIndexedDBDownloadProvider]
    : [createIndexedDBLazyProvider, createIndexedDBDownloadProvider];

  if (runtimeConfig.enableBroadcastChannelProvider) {
    providers.push(createBroadcastChannelProvider);
  }

  if (environment.isDesktop && runtimeConfig.enableSQLiteProvider) {
    providers.push(createSQLiteProvider, createSQLiteDBDownloadProvider);
  }

  return providers;
};

export const createAffineProviders = (): DocProviderCreator[] => {
  return (
    [
      runtimeConfig.enableBroadcastChannelProvider &&
        createBroadcastChannelProvider,
      createIndexedDBDownloadProvider,
    ] as DocProviderCreator[]
  ).filter(v => Boolean(v));
};
