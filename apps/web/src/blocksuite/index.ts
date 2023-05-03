import { config } from '@affine/env';
import {
  createIndexedDBDownloadProvider,
  createLocalProviders,
} from '@affine/workspace/providers';
import {
  createAffineWebSocketProvider,
  createBroadCastChannelProvider,
} from '@affine/workspace/providers';
import type { Provider } from '@affine/workspace/type';

import type { BlockSuiteWorkspace } from '../shared';
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
      createIndexedDBDownloadProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};

export { createLocalProviders };
