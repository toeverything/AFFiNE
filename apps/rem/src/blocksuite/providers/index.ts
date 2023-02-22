import { WebsocketProvider } from '@affine/datacenter';
import { IndexeddbPersistence } from 'y-indexeddb';

import {
  AffineProvider,
  BlockSuiteWorkspace,
  LocalProvider,
} from '../../shared';
import { apis } from '../../shared/apis';

export const createWebSocketProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): AffineProvider => {
  let webSocketProvider: WebsocketProvider | null = null;
  return {
    flavour: 'affine',
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
        }
      );
      console.log('connect', webSocketProvider.roomname);
      webSocketProvider.connect();
    },
    disconnect: () => {
      if (!webSocketProvider) {
        console.error('cannot find websocket provider');
        return;
      }
      console.log('disconnect', webSocketProvider.roomname);
      webSocketProvider?.disconnect();
    },
  };
};

export const createIndexedDBProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): LocalProvider => {
  let indexdbProvider: IndexeddbPersistence | null = null;
  return {
    flavour: 'local',
    connect: () => {
      indexdbProvider = new IndexeddbPersistence(
        blockSuiteWorkspace.room as string,
        blockSuiteWorkspace.doc
      );
    },
    disconnect: () => {
      if (!indexdbProvider) {
        console.error('cannot find indexdb provider');
        return;
      }
      indexdbProvider.destroy();
      indexdbProvider = null;
    },
  };
};
