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
  WorkspaceInfo,
  WorkspaceListProvider,
  WorkspaceMetadata,
} from '@toeverything/infra';
import { globalBlockSuiteSchema } from '@toeverything/infra';
import { difference } from 'lodash-es';
import { nanoid } from 'nanoid';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { IndexedDBBlobStorage } from '../local/blob-indexeddb';
import { SQLiteBlobStorage } from '../local/blob-sqlite';
import { IndexedDBDocStorage } from '../local/doc-indexeddb';
import { SqliteDocStorage } from '../local/doc-sqlite';
import { CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY } from './consts';
import { AffineStaticDocStorage } from './doc-static';

async function getCloudWorkspaceList() {
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

export class CloudWorkspaceListProvider implements WorkspaceListProvider {
  name = WorkspaceFlavour.AFFINE_CLOUD;
  notifyChannel = new BroadcastChannel(
    CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
  );

  getList(): Promise<WorkspaceMetadata[]> {
    return getCloudWorkspaceList();
  }
  async delete(workspaceId: string): Promise<void> {
    await fetcher({
      query: deleteWorkspaceMutation,
      variables: {
        id: workspaceId,
      },
    });
    // notify all browser tabs, so they can update their workspace list
    this.notifyChannel.postMessage(null);
  }
  async create(
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
    const blobStorage = environment.isDesktop
      ? new SQLiteBlobStorage(workspaceId)
      : new IndexedDBBlobStorage(workspaceId);
    const docStorage = environment.isDesktop
      ? new SqliteDocStorage(workspaceId)
      : new IndexedDBDocStorage(workspaceId);

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
  subscribe(
    callback: (changed: {
      added?: WorkspaceMetadata[] | undefined;
      deleted?: WorkspaceMetadata[] | undefined;
    }) => void
  ): () => void {
    let lastWorkspaceIDs: string[] = [];

    function scan() {
      (async () => {
        const allWorkspaceIDs = (await getCloudWorkspaceList()).map(
          workspace => workspace.id
        );
        const added = difference(allWorkspaceIDs, lastWorkspaceIDs);
        const deleted = difference(lastWorkspaceIDs, allWorkspaceIDs);
        lastWorkspaceIDs = allWorkspaceIDs;
        callback({
          added: added.map(id => ({
            id,
            flavour: WorkspaceFlavour.AFFINE_CLOUD,
          })),
          deleted: deleted.map(id => ({
            id,
            flavour: WorkspaceFlavour.AFFINE_CLOUD,
          })),
        });
      })().catch(err => {
        console.error(err);
      });
    }

    scan();

    // rescan if other tabs notify us
    this.notifyChannel.addEventListener('message', scan);
    return () => {
      this.notifyChannel.removeEventListener('message', scan);
    };
  }
  async getInformation(id: string): Promise<WorkspaceInfo | undefined> {
    // get information from both cloud and local storage

    // we use affine 'static' storage here, which use http protocol, no need to websocket.
    const cloudStorage = new AffineStaticDocStorage(id);
    const docStorage = environment.isDesktop
      ? new SqliteDocStorage(id)
      : new IndexedDBDocStorage(id);
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
}
