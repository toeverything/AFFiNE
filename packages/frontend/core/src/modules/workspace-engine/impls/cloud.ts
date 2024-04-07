import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  createWorkspaceMutation,
  deleteWorkspaceMutation,
  fetcher,
  findGraphQLError,
  getWorkspacesQuery,
} from '@affine/graphql';
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
import { CloudAwarenessConnection } from './engine/awareness-cloud';
import { CloudBlobStorage } from './engine/blob-cloud';
import { CloudDocEngineServer } from './engine/doc-cloud';
import { CloudStaticDocStorage } from './engine/doc-cloud-static';

export const CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY =
  'affine-cloud-workspace-changed';

export class CloudWorkspaceFlavourProvider
  extends Service
  implements WorkspaceFlavourProvider
{
  constructor(
    private readonly storageProvider: WorkspaceEngineStorageProvider
  ) {
    super();
  }
  flavour: WorkspaceFlavour = WorkspaceFlavour.AFFINE_CLOUD;
  notifyChannel = new BroadcastChannel(
    CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
  );

  async deleteWorkspace(id: string): Promise<void> {
    await fetcher({
      query: deleteWorkspaceMutation,
      variables: {
        id: id,
      },
    });
    // notify all browser tabs, so they can update their workspace list
    this.notifyChannel.postMessage(null);
  }
  async createWorkspace(
    initial: (
      docCollection: DocCollection,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata> {
    const tempId = nanoid();

    const docCollection = new DocCollection({
      id: tempId,
      idGenerator: () => nanoid(),
      schema: globalBlockSuiteSchema,
    });

    // create workspace on cloud, get workspace id
    const {
      createWorkspace: { id: workspaceId },
    } = await fetcher({
      query: createWorkspaceMutation,
    });

    // save the initial state to local storage, then sync to cloud
    const blobStorage = this.storageProvider.getBlobStorage(workspaceId);
    const docStorage = this.storageProvider.getDocStorage(workspaceId);

    // apply initial state
    await initial(docCollection, blobStorage);

    // save workspace to local storage, should be vary fast
    await docStorage.doc.set(
      workspaceId,
      encodeStateAsUpdate(docCollection.doc)
    );
    for (const subdocs of docCollection.doc.getSubdocs()) {
      await docStorage.doc.set(subdocs.guid, encodeStateAsUpdate(subdocs));
    }

    // notify all browser tabs, so they can update their workspace list
    this.notifyChannel.postMessage(null);

    return { id: workspaceId, flavour: WorkspaceFlavour.AFFINE_CLOUD };
  }
  async getWorkspaces(): Promise<WorkspaceMetadata[]> {
    try {
      const { workspaces } = await fetcher({
        query: getWorkspacesQuery,
      }).catch(() => {
        return { workspaces: [] };
      });
      const ids = workspaces.map(({ id }) => id);
      return ids.map(id => ({
        id,
        flavour: WorkspaceFlavour.AFFINE_CLOUD,
      }));
    } catch (err) {
      console.log(err);
      const e = findGraphQLError(err, e => e.extensions.code === 401);
      if (e) {
        // user not logged in
        return [];
      }

      throw err;
    }
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
      CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
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
    // get information from both cloud and local storage

    // we use affine 'static' storage here, which use http protocol, no need to websocket.
    const cloudStorage = new CloudStaticDocStorage(id);
    const docStorage = this.storageProvider.getDocStorage(id);
    // download root doc
    const localData = await docStorage.doc.get(id);
    const cloudData = await cloudStorage.pull(id);

    if (!cloudData && !localData) {
      return;
    }

    const bs = new DocCollection({
      id,
      schema: globalBlockSuiteSchema,
    });

    if (localData) applyUpdate(bs.doc, localData);
    if (cloudData) applyUpdate(bs.doc, cloudData.data);

    return {
      name: bs.meta.name,
      avatar: bs.meta.avatar,
    };
  }
  async getWorkspaceBlob(id: string, blob: string): Promise<Blob | null> {
    const localBlob = await this.storageProvider.getBlobStorage(id).get(blob);

    if (localBlob) {
      return localBlob;
    }

    const cloudBlob = new CloudBlobStorage(id);
    return await cloudBlob.get(blob);
  }
  getEngineProvider(workspace: Workspace): WorkspaceEngineProvider {
    return {
      getAwarenessConnections() {
        return [
          new BroadcastChannelAwarenessConnection(
            workspace.id,
            workspace.awareness
          ),
          new CloudAwarenessConnection(workspace.id, workspace.awareness),
        ];
      },
      getDocServer() {
        return new CloudDocEngineServer(workspace.id);
      },
      getDocStorage: () => {
        return this.storageProvider.getDocStorage(workspace.id);
      },
      getLocalBlobStorage: () => {
        return this.storageProvider.getBlobStorage(workspace.id);
      },
      getRemoteBlobStorages() {
        return [new CloudBlobStorage(workspace.id)];
      },
    };
  }
}
