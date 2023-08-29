import { DebugLogger } from '@affine/debug';
import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
  LocalIndexedDBDownloadProvider,
} from '@affine/env/workspace';
import { createLazyProvider } from '@affine/y-provider';
import { assertExists } from '@blocksuite/global/utils';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import {
  createIndexedDBProvider as create,
  downloadBinary,
} from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';

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
  return {
    flavour: 'affine-socket-io',
    ...createLazyProvider(doc, dataSource),
  };
};

const createIndexedDBBackgroundProvider: DocProviderCreator = (
  id,
  blockSuiteWorkspace
): LocalIndexedDBBackgroundProvider => {
  const indexeddbProvider = create(blockSuiteWorkspace);

  let connected = false;
  return {
    flavour: 'local-indexeddb-background',
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
  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });
  async function downloadAndApply(doc: Doc) {
    const binary = await downloadBinary(doc.guid);
    if (binary) {
      Y.applyUpdate(doc, binary, indexedDBDownloadOrigin);
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
      runtimeConfig.enableBroadcastChannelProvider &&
        createBroadcastChannelProvider,
      runtimeConfig.enableCloud && createAffineSocketIOProvider,
      runtimeConfig.enableCloud && createMergeCloudSnapshotProvider,
      createIndexedDBDownloadProvider,
    ] as DocProviderCreator[]
  ).filter(v => Boolean(v));
};

export const createAffinePublicProviders = (): DocProviderCreator[] => {
  return [createCloudDownloadProvider];
};
