import { apis } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { DocCollection } from '@blocksuite/store';
import type {
  BlobStorage,
  Workspace,
  WorkspaceEngineProvider,
  WorkspaceFlavourProvider,
  WorkspaceMetadata,
  WorkspaceProfileInfo,
} from '@toeverything/infra';
import { globalBlockSuiteSchema, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import type { WorkspaceEngineStorageProvider } from '../providers/engine';
import { BroadcastChannelAwarenessConnection } from './engine/awareness-broadcast-channel';

export const LOCAL_WORKSPACE_LOCAL_STORAGE_KEY = 'affine-local-workspace';
const LOCAL_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY =
  'affine-local-workspace-changed';

export class LocalWorkspaceFlavourProvider
  extends Service
  implements WorkspaceFlavourProvider
{
  constructor(
    private readonly storageProvider: WorkspaceEngineStorageProvider
  ) {
    super();
  }

  flavour: WorkspaceFlavour = WorkspaceFlavour.LOCAL;
  notifyChannel = new BroadcastChannel(
    LOCAL_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
  );

  async deleteWorkspace(id: string): Promise<void> {
    const allWorkspaceIDs: string[] = JSON.parse(
      localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
    );
    localStorage.setItem(
      LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
      JSON.stringify(allWorkspaceIDs.filter(x => x !== id))
    );

    if (apis && environment.isDesktop) {
      await apis.workspace.delete(id);
    }

    // notify all browser tabs, so they can update their workspace list
    this.notifyChannel.postMessage(id);
  }
  async createWorkspace(
    initial: (
      docCollection: DocCollection,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    const id = nanoid();

    const docCollection = new DocCollection({
      id: id,
      idGenerator: () => nanoid(),
      schema: globalBlockSuiteSchema,
    });

    // save the initial state to local storage, then sync to cloud
    const blobStorage = this.storageProvider.getBlobStorage(id);
    const docStorage = this.storageProvider.getDocStorage(id);

    // apply initial state
    await initial(docCollection, blobStorage);

    // save workspace to local storage, should be vary fast
    await docStorage.doc.set(id, encodeStateAsUpdate(docCollection.doc));
    for (const subdocs of docCollection.doc.getSubdocs()) {
      await docStorage.doc.set(subdocs.guid, encodeStateAsUpdate(subdocs));
    }

    // save workspace id to local storage
    const allWorkspaceIDs: string[] = JSON.parse(
      localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
    );
    allWorkspaceIDs.push(id);
    localStorage.setItem(
      LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
      JSON.stringify(allWorkspaceIDs)
    );

    // notify all browser tabs, so they can update their workspace list
    this.notifyChannel.postMessage(id);

    return { id, flavour: WorkspaceFlavour.LOCAL };
  }
  async getWorkspaces(): Promise<WorkspaceMetadata[]> {
    return JSON.parse(
      localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
    ).map((id: string) => ({ id, flavour: WorkspaceFlavour.LOCAL }));
  }
  subscribeWorkspaces(
    cb: (workspaces: WorkspaceMetadata[]) => void
  ): () => void {
    const scan = () => {
      (async () => {
        cb(await this.getWorkspaces());
      })().catch(err => {
        console.error(err);
      });
    };

    scan();

    const channel = new BroadcastChannel(
      LOCAL_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
    );
    channel.addEventListener('message', scan);

    return () => {
      channel.removeEventListener('message', scan);
      channel.close();
    };
  }
  async getWorkspaceProfile(
    id: string
  ): Promise<WorkspaceProfileInfo | undefined> {
    const docStorage = this.storageProvider.getDocStorage(id);
    const localData = await docStorage.doc.get(id);

    if (!localData) {
      return;
    }

    const bs = new DocCollection({
      id,
      schema: globalBlockSuiteSchema,
    });

    if (localData) applyUpdate(bs.doc, localData);

    return {
      name: bs.meta.name,
      avatar: bs.meta.avatar,
    };
  }
  getWorkspaceBlob(id: string, blob: string): Promise<Blob | null> {
    return this.storageProvider.getBlobStorage(id).get(blob);
  }

  getEngineProvider(workspace: Workspace): WorkspaceEngineProvider {
    return {
      getAwarenessConnections() {
        return [
          new BroadcastChannelAwarenessConnection(
            workspace.id,
            workspace.awareness
          ),
        ];
      },
      getDocServer() {
        return null;
      },
      getDocStorage: () => {
        return this.storageProvider.getDocStorage(workspace.id);
      },
      getLocalBlobStorage: () => {
        return this.storageProvider.getBlobStorage(workspace.id);
      },
      getRemoteBlobStorages() {
        return [];
      },
    };
  }
}
