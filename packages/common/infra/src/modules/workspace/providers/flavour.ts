import type { WorkspaceFlavour } from '@affine/env/workspace';
import type { DocCollection } from '@blocksuite/affine/store';

import { createIdentifier } from '../../../framework';
import type { LiveData } from '../../../livedata';
import type {
  AwarenessConnection,
  BlobStorage,
  DocServer,
  DocStorage,
} from '../../../sync';
import type { WorkspaceProfileInfo } from '../entities/profile';
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
      blobStorage: BlobStorage,
      docStorage: DocStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata>;

  workspaces$: LiveData<WorkspaceMetadata[]>;

  /**
   * means the workspace list is loading. if it's true, the workspace page will show loading spinner.
   */
  isRevalidating$?: LiveData<boolean>;

  /**
   * revalidate the workspace list.
   *
   * will be called when user open workspace list, or workspace not found.
   */
  revalidate?: () => void;

  getWorkspaceProfile(
    id: string,
    signal?: AbortSignal
  ): Promise<WorkspaceProfileInfo | undefined>;

  getWorkspaceBlob(id: string, blob: string): Promise<Blob | null>;

  getEngineProvider(workspaceId: string): WorkspaceEngineProvider;
}

export const WorkspaceFlavourProvider =
  createIdentifier<WorkspaceFlavourProvider>('WorkspaceFlavourProvider');
