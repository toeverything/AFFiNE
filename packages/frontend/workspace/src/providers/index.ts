import { DebugLogger } from '@affine/debug';
import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
} from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import {
  createIndexedDBDatasource,
  createIndexedDBProvider as create,
} from '@toeverything/y-indexeddb';
import { createLazyProvider } from 'y-provider';
import { encodeStateVector } from 'yjs';

import { createAffineDataSource } from '../affine';
import {
  createCloudDownloadProvider,
  createMergeCloudSnapshotProvider,
  downloadBinaryFromCloud,
} from './cloud';
import {
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
} from './sqlite-providers';

const Y = Workspace.Y;
const logger = new DebugLogger('indexeddb-provider');

const createAffineSocketIOProvider: DocProviderCreator = (
  id,
  doc,
  { awareness }
): AffineSocketIOProvider => {
  const dataSource = createAffineDataSource(id, doc, awareness);
  const lazyProvider = createLazyProvider(doc, dataSource, {
    origin: 'affine-socket-io',
  });

  Object.assign(lazyProvider, { flavour: 'affine-socket-io' });

  return lazyProvider as unknown as AffineSocketIOProvider;
};

const createIndexedDBBackgroundProvider: DocProviderCreator = (
  id,
  blockSuiteWorkspace
): LocalIndexedDBBackgroundProvider => {
  const indexeddbProvider = create(blockSuiteWorkspace);

  let connected = false;
  return {
    flavour: 'local-indexeddb-background',
    datasource: indexeddbProvider.datasource,
    passive: true,
    get status() {
      return indexeddbProvider.status;
    },
    subscribeStatusChange: indexeddbProvider.subscribeStatusChange,
    get connected() {
      return connected;
    },
    cleanup: () => {
      indexeddbProvider.cleanup().catch(console.error);
    },
    connect: () => {
      logger.info('connect indexeddb provider', id);
      indexeddbProvider.connect();
    },
    disconnect: () => {
      assertExists(indexeddbProvider);
      logger.info('disconnect indexeddb provider', id);
      indexeddbProvider.disconnect();
      connected = false;
    },
  };
};

const indexedDBDownloadOrigin = 'indexeddb-download-provider';

const createIndexedDBDownloadProvider: DocProviderCreator = (
  id,
  doc
): LocalIndexedDBDownloadProvider => {
  const datasource = createIndexedDBDatasource({});
  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

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
      datasource
        .queryDocState(doc.guid, {
          stateVector: encodeStateVector(doc),
        })
        .then(docState => {
          if (docState) {
            Y.applyUpdate(doc, docState.missing, indexedDBDownloadOrigin);
          }
          _resolve();
        })
        .catch(_reject);
    },
  };
};

export {
  createAffineSocketIOProvider,
  createBroadcastChannelProvider,
  createIndexedDBBackgroundProvider,
  createIndexedDBDownloadProvider,
  createSQLiteDBDownloadProvider,
  createSQLiteProvider,
  downloadBinaryFromCloud,
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
      ...createLocalProviders(),
      runtimeConfig.enableCloud && createAffineSocketIOProvider,
      runtimeConfig.enableCloud && createMergeCloudSnapshotProvider,
    ] as DocProviderCreator[]
  ).filter(v => Boolean(v));
};

export const createAffinePublicProviders = (): DocProviderCreator[] => {
  return [createCloudDownloadProvider];
};
