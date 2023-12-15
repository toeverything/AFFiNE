import { WorkspaceFlavour } from '@affine/env/workspace';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { difference } from 'lodash-es';
import { nanoid } from 'nanoid';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { globalBlockSuiteSchema } from '../../global-schema';
import type { WorkspaceListProvider } from '../../list';
import { createLocalBlobStorage } from './blob';
import {
  LOCAL_WORKSPACE_CREATED_BROADCAST_CHANNEL_KEY,
  LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
} from './consts';
import { createLocalStorage } from './sync';

export function createLocalWorkspaceListProvider(): WorkspaceListProvider {
  const notifyChannel = new BroadcastChannel(
    LOCAL_WORKSPACE_CREATED_BROADCAST_CHANNEL_KEY
  );

  return {
    name: WorkspaceFlavour.LOCAL,
    getList() {
      return Promise.resolve(
        JSON.parse(
          localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
        ).map((id: string) => ({ id, flavour: WorkspaceFlavour.LOCAL }))
      );
    },
    subscribe(callback) {
      let lastWorkspaceIDs: string[] = [];

      function scan() {
        const allWorkspaceIDs: string[] = JSON.parse(
          localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
        );
        const added = difference(allWorkspaceIDs, lastWorkspaceIDs);
        const deleted = difference(lastWorkspaceIDs, allWorkspaceIDs);
        lastWorkspaceIDs = allWorkspaceIDs;
        callback({
          added: added.map(id => ({ id, flavour: WorkspaceFlavour.LOCAL })),
          deleted: deleted.map(id => ({ id, flavour: WorkspaceFlavour.LOCAL })),
        });
      }

      scan();

      // rescan if other tabs notify us
      notifyChannel.addEventListener('message', scan);
      return () => {
        notifyChannel.removeEventListener('message', scan);
      };
    },
    async create(initial) {
      const id = nanoid();

      const blobStorage = createLocalBlobStorage(id);
      const syncStorage = createLocalStorage(id);

      const workspace = new BlockSuiteWorkspace({
        id: id,
        idGenerator: () => nanoid(),
        schema: globalBlockSuiteSchema,
      });

      // apply initial state
      await initial(workspace, blobStorage);

      // save workspace to local storage
      await syncStorage.push(id, encodeStateAsUpdate(workspace.doc));
      for (const subdocs of workspace.doc.getSubdocs()) {
        await syncStorage.push(subdocs.guid, encodeStateAsUpdate(subdocs));
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
      notifyChannel.postMessage(id);

      return id;
    },
    async delete(workspaceId) {
      const allWorkspaceIDs: string[] = JSON.parse(
        localStorage.getItem(LOCAL_WORKSPACE_LOCAL_STORAGE_KEY) ?? '[]'
      );
      localStorage.setItem(
        LOCAL_WORKSPACE_LOCAL_STORAGE_KEY,
        JSON.stringify(allWorkspaceIDs.filter(x => x !== workspaceId))
      );

      if (window.apis && environment.isDesktop) {
        await window.apis.workspace.delete(workspaceId);
      }

      // notify all browser tabs, so they can update their workspace list
      notifyChannel.postMessage(workspaceId);
    },
    async getInformation(id) {
      // get information from root doc

      const storage = createLocalStorage(id);
      const data = await storage.pull(id, new Uint8Array([]));

      if (!data) {
        return;
      }

      const bs = new BlockSuiteWorkspace({
        id,
        schema: globalBlockSuiteSchema,
      });

      applyUpdate(bs.doc, data.data);

      return {
        name: bs.meta.name,
        avatar: bs.meta.avatar,
      };
    },
  };
}
