import type {
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
} from '@affine/env/workspace';
import type { DocProviderCreator } from '@blocksuite/store';
import { assertExists, Workspace } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import {
  createIndexedDBProvider as create,
  downloadBinary,
  EarlyDisconnectError,
} from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';

import { CallbackSet } from '../utils';
import { localProviderLogger as logger } from './logger';
import {
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
} from './sqlite-providers';

const Y = Workspace.Y;

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
