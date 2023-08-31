import { DebugLogger } from '@affine/debug';
import type { LocalWorkspace, WorkspaceCRUD } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { nanoid, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { createJSONStorage } from 'jotai/utils';
import { z } from 'zod';

import { getOrCreateWorkspace } from '../manager';

const getStorage = () => createJSONStorage(() => localStorage);

const kStoreKey = 'affine-local-workspace';
const schema = z.array(z.string());

const logger = new DebugLogger('affine:workspace:local:crud');

/**
 * @internal
 */
export function saveWorkspaceToLocalStorage(workspaceId: string) {
  const storage = getStorage();
  !Array.isArray(storage.getItem(kStoreKey, [])) &&
    storage.setItem(kStoreKey, []);
  const data = storage.getItem(kStoreKey, []) as z.infer<typeof schema>;
  const id = data.find(id => id === workspaceId);
  if (!id) {
    logger.debug('saveWorkspaceToLocalStorage', workspaceId);
    storage.setItem(kStoreKey, [...data, workspaceId]);
  }
}

export const CRUD: WorkspaceCRUD<WorkspaceFlavour.LOCAL> = {
  get: async workspaceId => {
    logger.debug('get', workspaceId);
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey, [])) &&
      storage.setItem(kStoreKey, []);
    const data = storage.getItem(kStoreKey, []) as z.infer<typeof schema>;
    const id = data.find(id => id === workspaceId);
    if (!id) {
      return null;
    }
    const blockSuiteWorkspace = getOrCreateWorkspace(
      id,
      WorkspaceFlavour.LOCAL
    );
    const workspace: LocalWorkspace = {
      id,
      flavour: WorkspaceFlavour.LOCAL,
      blockSuiteWorkspace: blockSuiteWorkspace,
    };
    return workspace;
  },
  create: async ({ doc }) => {
    logger.debug('create', doc);
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey, [])) &&
      storage.setItem(kStoreKey, []);
    const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdate(doc);
    const id = nanoid();
    const blockSuiteWorkspace = getOrCreateWorkspace(
      id,
      WorkspaceFlavour.LOCAL
    );
    BlockSuiteWorkspace.Y.applyUpdate(blockSuiteWorkspace.doc, binary);

    doc.getSubdocs().forEach(subdoc => {
      blockSuiteWorkspace.doc.getSubdocs().forEach(newDoc => {
        if (subdoc.guid === newDoc.guid) {
          BlockSuiteWorkspace.Y.applyUpdate(
            newDoc,
            BlockSuiteWorkspace.Y.encodeStateAsUpdate(subdoc)
          );
        }
      });
    });
    // todo: do we need to persist doc to persistence datasource?
    saveWorkspaceToLocalStorage(id);
    return id;
  },
  delete: async workspace => {
    logger.debug('delete', workspace);
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey, [])) &&
      storage.setItem(kStoreKey, []);
    const data = storage.getItem(kStoreKey, []) as z.infer<typeof schema>;
    const idx = data.findIndex(id => id === workspace.id);
    if (idx === -1) {
      throw new Error('workspace not found');
    }
    data.splice(idx, 1);
    storage.setItem(kStoreKey, [...data]);
    // flywire
    if (window.apis && environment.isDesktop) {
      await window.apis.workspace.delete(workspace.id);
    }
  },
  list: async () => {
    logger.debug('list');
    const storage = getStorage();
    let allWorkspaceIDs: string[] = storage.getItem(kStoreKey, []) as z.infer<
      typeof schema
    >;

    // fixme: remove this once desktop data migration is done
    if (window.apis && environment.isDesktop) {
      const desktopIds = (await window.apis.workspace.list()).map(v => v[0]);
      allWorkspaceIDs = [...new Set([...allWorkspaceIDs, ...desktopIds])];
      storage.setItem(kStoreKey, allWorkspaceIDs);
    }

    const workspaces = (
      await Promise.all(allWorkspaceIDs.map(id => CRUD.get(id)))
    ).filter(item => item !== null) as LocalWorkspace[];

    return workspaces;
  },
};
