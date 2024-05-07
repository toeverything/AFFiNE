import {
  type BlobStorage,
  createIdentifier,
  type DocStorage,
} from '@toeverything/infra';

export interface WorkspaceEngineStorageProvider {
  getDocStorage(workspaceId: string): DocStorage;
  getBlobStorage(workspaceId: string): BlobStorage;
}

export const WorkspaceEngineStorageProvider =
  createIdentifier<WorkspaceEngineStorageProvider>(
    'WorkspaceEngineStorageProvider'
  );
