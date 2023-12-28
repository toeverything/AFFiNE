import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  createWorkspaceMutation,
  deleteWorkspaceMutation,
  getWorkspacesQuery,
} from '@affine/graphql';
import { fetcher } from '@affine/graphql';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { difference } from 'lodash-es';
import { nanoid } from 'nanoid';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { globalBlockSuiteSchema } from '../../global-schema';
import type { WorkspaceListProvider } from '../../list';
import { createLocalBlobStorage } from '../local/blob';
import { createLocalStorage } from '../local/sync';
import { CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY } from './consts';
import { createAffineStaticStorage } from './sync';

async function getCloudWorkspaceList() {
  try {
    const { workspaces } = await fetcher({
      query: getWorkspacesQuery,
    });
    const ids = workspaces.map(({ id }) => id);
    return ids.map(id => ({
      id,
      flavour: WorkspaceFlavour.AFFINE_CLOUD,
    }));
  } catch (err) {
    if (err instanceof Array && err[0]?.message === 'Forbidden resource') {
      // user not logged in
      return [];
    }
    throw err;
  }
}

export function createCloudWorkspaceListProvider(): WorkspaceListProvider {
  const notifyChannel = new BroadcastChannel(
    CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
  );

  return {
    name: WorkspaceFlavour.AFFINE_CLOUD,
    async getList() {
      return getCloudWorkspaceList();
    },
    async create(initial) {
      const tempId = nanoid();

      const workspace = new BlockSuiteWorkspace({
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
      const blobStorage = createLocalBlobStorage(workspaceId);
      const syncStorage = createLocalStorage(workspaceId);

      // apply initial state
      await initial(workspace, blobStorage);

      // save workspace to local storage, should be vary fast
      await syncStorage.push(workspaceId, encodeStateAsUpdate(workspace.doc));
      for (const subdocs of workspace.doc.getSubdocs()) {
        await syncStorage.push(subdocs.guid, encodeStateAsUpdate(subdocs));
      }

      // notify all browser tabs, so they can update their workspace list
      notifyChannel.postMessage(null);

      return workspaceId;
    },
    async delete(id) {
      await fetcher({
        query: deleteWorkspaceMutation,
        variables: {
          id,
        },
      });
      // notify all browser tabs, so they can update their workspace list
      notifyChannel.postMessage(null);
    },
    subscribe(callback) {
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
      notifyChannel.addEventListener('message', scan);
      return () => {
        notifyChannel.removeEventListener('message', scan);
      };
    },
    async getInformation(id) {
      // get information from both cloud and local storage

      // we use affine 'static' storage here, which use http protocol, no need to websocket.
      const cloudStorage = createAffineStaticStorage(id);
      const localStorage = createLocalStorage(id);
      // download root doc
      const localData = await localStorage.pull(id, new Uint8Array([]));
      const cloudData = await cloudStorage.pull(id, new Uint8Array([]));

      if (!cloudData && !localData) {
        return;
      }

      const bs = new BlockSuiteWorkspace({
        id,
        schema: globalBlockSuiteSchema,
      });

      if (localData) applyUpdate(bs.doc, localData.data);
      if (cloudData) applyUpdate(bs.doc, cloudData.data);

      return {
        name: bs.meta.name,
        avatar: bs.meta.avatar,
      };
    },
  };
}
