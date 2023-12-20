import type { WorkspaceMetadata } from './metadata';
import type { Workspace } from './workspace';

export interface WorkspaceFactory {
  name: string;

  openWorkspace(metadata: WorkspaceMetadata): Workspace;

  /**
   * get blob without open workspace
   */
  getWorkspaceBlob(id: string, blobKey: string): Promise<Blob | null>;
}
