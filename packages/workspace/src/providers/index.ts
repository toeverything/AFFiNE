import { config } from '@affine/env';
import { KeckProvider } from '@affine/workspace/affine/keck';
import { getLoginStorage } from '@affine/workspace/affine/login';
import type { Provider } from '@affine/workspace/type';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBProvider,
} from '@affine/workspace/type';
import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { IndexeddbPersistence } from 'y-indexeddb';

import { createBroadCastChannelProvider } from './broad-cast-channel';
import { localProviderLogger } from './logger';

const createAffineWebSocketProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): AffineWebSocketProvider => {
  let webSocketProvider: KeckProvider | null = null;
  return {
    flavour: 'affine-websocket',
    background: false,
    cleanup: () => {
      assertExists(webSocketProvider);
      webSocketProvider.destroy();
      webSocketProvider = null;
    },
    connect: () => {
      const wsUrl = `${
        window.location.protocol === 'https:' ? 'wss' : 'ws'
      }://${window.location.host}/api/sync/`;
      webSocketProvider = new KeckProvider(
        wsUrl,
        blockSuiteWorkspace.id,
        blockSuiteWorkspace.doc,
        {
          params: { token: getLoginStorage()?.token ?? '' },
          // @ts-expect-error ignore the type
          awareness: blockSuiteWorkspace.awarenessStore.awareness,
          // we maintain broadcast channel by ourselves
          disableBc: true,
          connect: false,
        }
      );
      localProviderLogger.info('connect', webSocketProvider.url);
      webSocketProvider.connect();
    },
    disconnect: () => {
      assertExists(webSocketProvider);
      localProviderLogger.info('disconnect', webSocketProvider.url);
      webSocketProvider.destroy();
      webSocketProvider = null;
    },
  };
};

const createIndexedDBProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): LocalIndexedDBProvider => {
  let indexeddbProvider: IndexeddbPersistence | null = null;
  const callbacks = new Set<() => void>();
  return {
    flavour: 'local-indexeddb',
    callbacks,
    // fixme: remove background long polling
    background: true,
    cleanup: () => {
      assertExists(indexeddbProvider);
      indexeddbProvider.clearData();
      callbacks.clear();
      indexeddbProvider = null;
    },
    connect: () => {
      localProviderLogger.info(
        'connect indexeddb provider',
        blockSuiteWorkspace.id
      );
      indexeddbProvider = new IndexeddbPersistence(
        blockSuiteWorkspace.id,
        blockSuiteWorkspace.doc
      );
      indexeddbProvider.whenSynced.then(() => {
        callbacks.forEach(cb => cb());
      });
    },
    disconnect: () => {
      assertExists(indexeddbProvider);
      localProviderLogger.info(
        'disconnect indexeddb provider',
        blockSuiteWorkspace.id
      );
      indexeddbProvider.destroy();
      indexeddbProvider = null;
    },
  };
};

export {
  createAffineWebSocketProvider,
  createBroadCastChannelProvider,
  createIndexedDBProvider,
};

export const createLocalProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      config.enableBroadCastChannelProvider &&
        createBroadCastChannelProvider(blockSuiteWorkspace),
      config.enableIndexedDBProvider &&
        createIndexedDBProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};
