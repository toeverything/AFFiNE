import { KeckProvider } from '@affine/workspace/affine/keck';
import { getLoginStorage } from '@affine/workspace/affine/login';
import type {
  AffineWebSocketProvider,
  LocalIndexedDBProvider,
} from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';
import { IndexeddbPersistence } from 'y-indexeddb';

import type { BlockSuiteWorkspace } from '../../shared';
import { providerLogger } from '../logger';
import { createBroadCastChannelProvider } from './broad-cast-channel';

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
      providerLogger.info('connect', webSocketProvider.url);
      webSocketProvider.connect();
    },
    disconnect: () => {
      assertExists(webSocketProvider);
      providerLogger.info('disconnect', webSocketProvider.url);
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
      providerLogger.info('connect indexeddb provider', blockSuiteWorkspace.id);
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
      providerLogger.info(
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
