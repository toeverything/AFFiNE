import {
  cloudWorkspaceFactory,
  createCloudWorkspaceListProvider,
  createLocalWorkspaceListProvider,
  localWorkspaceFactory,
} from './impl';
import { WorkspaceList } from './list';
import { WorkspaceManager } from './manager';

const list = new WorkspaceList([
  createLocalWorkspaceListProvider(),
  createCloudWorkspaceListProvider(),
]);

export const workspaceManager = new WorkspaceManager(list, [
  localWorkspaceFactory,
  cloudWorkspaceFactory,
]);

(window as any).workspaceManager = workspaceManager;

export * from './engine';
export * from './factory';
export * from './global-schema';
export * from './impl';
export * from './list';
export * from './manager';
export * from './metadata';
export * from './workspace';
