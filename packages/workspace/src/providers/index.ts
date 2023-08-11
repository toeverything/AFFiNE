import { DebugLogger } from '@affine/debug';
import type {
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
} from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import {
  createIndexedDBProvider as create,
  downloadBinaries,
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
  blockSuiteWorkspace
): LocalIndexedDBBackgroundProvider => {
  const indexeddbProvider = create(blockSuiteWorkspace);
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

const cache: WeakMap<Doc, Uint8Array[]> = new WeakMap();

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
    if (cache.has(doc)) {
      const binaries = cache.get(doc) as Uint8Array[];
      binaries.forEach(binary => {
        Y.applyUpdate(doc, binary);
      });
      return;
    }
    const binaries = await downloadBinaries(doc.guid);
    if (!binaries) {
      return;
    }
    cache.set(doc, binaries);
    binaries.forEach(binary => {
      Y.applyUpdate(doc, binary);
    });
    await Promise.all([...doc.subdocs].map(downloadBinaryRecursively));
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
      downloadBinaryRecursively(doc).then(_resolve).catch(_reject);
    },
  };
};

export {
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
