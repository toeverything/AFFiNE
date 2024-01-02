import { WorkspaceList, WorkspaceManager } from '@affine/workspace';

import {
  cloudWorkspaceFactory,
  createCloudWorkspaceListProvider,
} from './cloud';
import {
  createLocalWorkspaceListProvider,
  LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
  localWorkspaceFactory,
} from './local';

const list = new WorkspaceList([
  createLocalWorkspaceListProvider(),
  createCloudWorkspaceListProvider(),
]);

export const workspaceManager = new WorkspaceManager(list, [
  localWorkspaceFactory,
  cloudWorkspaceFactory,
]);

(window as any).workspaceManager = workspaceManager;

export * from './cloud';
export * from './local';

/**
 * a hack for directly add local workspace to workspace list
 * Used after copying sqlite database file to appdata folder
 */
export function _addLocalWorkspace(id: string) {
  const allWorkspaceIDs: string[] = JSON.parse(
    localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
  );
  allWorkspaceIDs.push(id);
  localStorage.setItem(
    LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
    JSON.stringify(allWorkspaceIDs)
  );
}
