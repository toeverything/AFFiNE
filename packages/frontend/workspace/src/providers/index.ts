import { DebugLogger } from '@affine/debug';
import type {
  AffineSocketIOProvider,
  LocalIndexedDBBackgroundProvider,
} from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import type { DocProviderCreator } from '@blocksuite/store';
import { createBroadcastChannelProvider } from '@blocksuite/store/providers/broadcast-channel';
import { createIndexedDBProvider as create } from '@toeverything/y-indexeddb';
import { createLazyProvider } from 'y-provider';

import { createAffineDataSource } from '../affine';
import { createCloudDownloadProvider, downloadBinaryFromCloud } from './cloud';
import { createSQLiteProvider } from './sqlite-providers';

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
    active: true,
    get whenReady() {
      return indexeddbProvider.whenReady;
    },
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
    sync: () => {
      indexeddbProvider.sync();
    },
    disconnect: () => {
      assertExists(indexeddbProvider);
      logger.info('disconnect indexeddb provider', id);
      indexeddbProvider.disconnect();
      connected = false;
    },
  };
};

export {
  createAffineSocketIOProvider,
  createBroadcastChannelProvider,
  createIndexedDBBackgroundProvider,
  createSQLiteProvider,
  downloadBinaryFromCloud,
};

export const createLocalProviders = (): DocProviderCreator[] => {
  const providers = [createIndexedDBBackgroundProvider] as DocProviderCreator[];

  if (runtimeConfig.enableBroadcastChannelProvider) {
    providers.push(createBroadcastChannelProvider);
  }

  if (environment.isDesktop && runtimeConfig.enableSQLiteProvider) {
    providers.push(createSQLiteProvider);
  }

  return providers;
};

export const createAffineProviders = (): DocProviderCreator[] => {
  return (
    [
      ...createLocalProviders(),
      runtimeConfig.enableCloud && createAffineSocketIOProvider,
    ] as DocProviderCreator[]
  ).filter(v => Boolean(v));
};

export const createAffinePublicProviders = (): DocProviderCreator[] => {
  return [createCloudDownloadProvider];
};
