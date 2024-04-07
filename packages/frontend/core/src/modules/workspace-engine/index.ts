export { CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY } from './impls/cloud';

import { type Framework, WorkspaceFlavourProvider } from '@toeverything/infra';

import { CloudWorkspaceFlavourProvider } from './impls/cloud';
import { IndexedDBBlobStorage } from './impls/engine/blob-indexeddb';
import { SqliteBlobStorage } from './impls/engine/blob-sqlite';
import { IndexedDBDocStorage } from './impls/engine/doc-indexeddb';
import { SqliteDocStorage } from './impls/engine/doc-sqlite';
import {
  LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
  LocalWorkspaceFlavourProvider,
} from './impls/local';
import { WorkspaceEngineStorageProvider } from './providers/engine';

export function configureBrowserWorkspaceFlavours(framework: Framework) {
  framework
    .impl(WorkspaceFlavourProvider('LOCAL'), LocalWorkspaceFlavourProvider, [
      WorkspaceEngineStorageProvider,
    ])
    .impl(WorkspaceFlavourProvider('CLOUD'), CloudWorkspaceFlavourProvider, [
      WorkspaceEngineStorageProvider,
    ]);
}

export function configureIndexedDBWorkspaceEngineStorageProvider(
  framework: Framework
) {
  framework.impl(WorkspaceEngineStorageProvider, {
    getDocStorage(workspaceId: string) {
      return new IndexedDBDocStorage(workspaceId);
    },
    getBlobStorage(workspaceId: string) {
      return new IndexedDBBlobStorage(workspaceId);
    },
  });
}

export function configureSqliteWorkspaceEngineStorageProvider(
  framework: Framework
) {
  framework.impl(WorkspaceEngineStorageProvider, {
    getDocStorage(workspaceId: string) {
      return new SqliteDocStorage(workspaceId);
    },
    getBlobStorage(workspaceId: string) {
      return new SqliteBlobStorage(workspaceId);
    },
  });
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
