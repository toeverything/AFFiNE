import { websocketPrefixUrl } from '@affine/env';
import { KeckProvider } from '@affine/workspace/affine/keck';
import { getLoginStorage } from '@affine/workspace/affine/login';
import type { AffineWebSocketProvider } from '@affine/workspace/type';
import { assertExists } from '@blocksuite/store';

import type { BlockSuiteWorkspace } from '../../shared';
import { providerLogger } from '../logger';

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
      webSocketProvider = new KeckProvider(
        websocketPrefixUrl + '/api/sync/',
        blockSuiteWorkspace.id,
        blockSuiteWorkspace.doc,
        {
          params: { token: getLoginStorage()?.token ?? '' },
          awareness: blockSuiteWorkspace.awarenessStore.awareness,
          // we maintain broadcast channel by ourselves
          // @ts-expect-error
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

export { createAffineWebSocketProvider };
