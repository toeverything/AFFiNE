import { BlockSuiteWorkspace, Provider } from '../shared';
import { config } from '../shared/env';
import { createIndexedDBProvider, createWebSocketProvider } from './providers';

export const createAffineProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      createWebSocketProvider(blockSuiteWorkspace),
      config.enableIndexedDBProvider &&
        createIndexedDBProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};

export const createLocalProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return (
    [
      config.enableIndexedDBProvider &&
        createIndexedDBProvider(blockSuiteWorkspace),
    ] as any[]
  ).filter(v => Boolean(v));
};
