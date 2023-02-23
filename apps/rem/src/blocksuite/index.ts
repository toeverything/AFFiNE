import { BlockSuiteWorkspace, Provider } from '../shared';
import { createIndexedDBProvider, createWebSocketProvider } from './providers';

export const createAffineProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return [
    createWebSocketProvider(blockSuiteWorkspace),
    createIndexedDBProvider(blockSuiteWorkspace),
  ];
};

export const createLocalProviders = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): Provider[] => {
  return [createIndexedDBProvider(blockSuiteWorkspace)];
};
