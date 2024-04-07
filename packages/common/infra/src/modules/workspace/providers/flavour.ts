import type { WorkspaceFlavour } from '@affine/env/workspace';
import type { DocCollection } from '@blocksuite/store';

import { createIdentifier } from '../../../framework';
import type {
  AwarenessConnection,
  BlobStorage,
  DocServer,
  DocStorage,
} from '../../../sync';
import type { WorkspaceProfileInfo } from '../entities/profile';
import type { Workspace } from '../entities/workspace';
import type { WorkspaceMetadata } from '../metadata';

export interface WorkspaceEngineProvider {
  getDocServer(): DocServer | null;
  getDocStorage(): DocStorage;
  getLocalBlobStorage(): BlobStorage;
  getRemoteBlobStorages(): BlobStorage[];
  getAwarenessConnections(): AwarenessConnection[];
}

export interface WorkspaceFlavourProvider {
  flavour: WorkspaceFlavour;

  deleteWorkspace(id: string): Promise<void>;

  createWorkspace(
    initial: (
      docCollection: DocCollection,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata>;

  getWorkspaces(): Promise<WorkspaceMetadata[]>;

  subscribeWorkspaces(
    cb: (workspaces: WorkspaceMetadata[]) => void
  ): () => void;

  getWorkspaceProfile(id: string): Promise<WorkspaceProfileInfo | undefined>;

  getWorkspaceBlob(id: string, blob: string): Promise<Blob | null>;

  getEngineProvider(workspace: Workspace): WorkspaceEngineProvider;
}

export const WorkspaceFlavourProvider =
  createIdentifier<WorkspaceFlavourProvider>('WorkspaceFlavourProvider');
