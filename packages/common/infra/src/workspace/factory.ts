import { createIdentifier, type ServiceCollection } from '../di';

export interface WorkspaceFactory {
  name: string;

  configureWorkspace(services: ServiceCollection): void;

  /**
   * get blob without open workspace
   */
  getWorkspaceBlob(id: string, blobKey: string): Promise<Blob | null>;
}

export const WorkspaceFactory =
  createIdentifier<WorkspaceFactory>('WorkspaceFactory');
