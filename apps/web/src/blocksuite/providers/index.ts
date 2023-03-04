import { WebsocketProvider } from '@affine/datacenter';
import { assertExists } from '@blocksuite/store';
import { IndexeddbPersistence } from 'y-indexeddb';

import {
  AffineWebSocketProvider,
  BlockSuiteWorkspace,
  LocalIndexedDBProvider,
} from '../../shared';
import { apis } from '../../shared/apis';
import { providerLogger } from '../logger';
import { createBroadCastChannelProvider } from './broad-cast-channel';

const createAffineWebSocketProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): AffineWebSocketProvider => {
  let webSocketProvider: WebsocketProvider | null = null;
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
      webSocketProvider = new WebsocketProvider(
        wsUrl,
        blockSuiteWorkspace.room as string,
        blockSuiteWorkspace.doc,
        {
          params: { token: apis.auth.refresh },
          // @ts-expect-error ignore the type
          awareness: blockSuiteWorkspace.awarenessStore.awareness,
          // we maintain broadcast channel by ourselves
          disableBc: true,
          connect: false,
        }
      );
      providerLogger.info('connect', webSocketProvider.roomname);
      webSocketProvider.connect();
    },
    disconnect: () => {
      assertExists(webSocketProvider);
      providerLogger.info('disconnect', webSocketProvider.roomname);
      webSocketProvider.destroy();
      webSocketProvider = null;
    },
  };
};

const createIndexedDBProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): LocalIndexedDBProvider => {
  let indexeddbProvider: IndexeddbPersistence | null = null;
  return {
    flavour: 'local-indexeddb',
    // fixme: remove background long polling
    background: true,
    cleanup: () => {
      assertExists(indexeddbProvider);
      indexeddbProvider.clearData();
      indexeddbProvider = null;
    },
    connect: () => {
      providerLogger.info(
        'connect indexeddb provider',
        blockSuiteWorkspace.room
      );
      indexeddbProvider = new IndexeddbPersistence(
        blockSuiteWorkspace.room as string,
        blockSuiteWorkspace.doc
      );
    },
    disconnect: () => {
      assertExists(indexeddbProvider);
      providerLogger.info(
        'disconnect indexeddb provider',
        blockSuiteWorkspace.room
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
