import { config } from '@affine/env';
import {
  createIndexedDBProvider,
  createLocalProviders,
} from '@affine/workspace/providers';
import { createBroadCastChannelProvider } from '@affine/workspace/providers';
import type { Provider } from '@affine/workspace/type';

import type { BlockSuiteWorkspace } from '../shared';
import { createAffineWebSocketProvider } from './providers';
import { createAffineDownloadProvider } from './providers/affine';

export const createAffineProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      createAffineDownloadProvider(blockSuiteWorkspace),
      createAffineWebSocketProvider(blockSuiteWorkspace),
      config.enableBroadCastChannelProvider &&
        createBroadCastChannelProvider(blockSuiteWorkspace),
      config.enableIndexedDBProvider &&
        createIndexedDBProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};

export { createLocalProviders };
