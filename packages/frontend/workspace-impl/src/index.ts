import { WorkspaceFactory, WorkspaceListProvider } from '@toeverything/infra';
import type { ServiceCollection } from '@toeverything/infra/di';

import { CloudWorkspaceFactory, CloudWorkspaceListProvider } from './cloud';
import {
  LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
  LocalWorkspaceFactory,
  LocalWorkspaceListProvider,
} from './local';

export * from './cloud';
export * from './local';

export function configureWorkspaceImplServices(services: ServiceCollection) {
  services
    .addImpl(WorkspaceListProvider('affine-cloud'), CloudWorkspaceListProvider)
    .addImpl(WorkspaceFactory('affine-cloud'), CloudWorkspaceFactory)
    .addImpl(WorkspaceListProvider('local'), LocalWorkspaceListProvider)
    .addImpl(WorkspaceFactory('local'), LocalWorkspaceFactory);
}

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
