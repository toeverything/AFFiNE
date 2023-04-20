import { DebugLogger } from '@affine/debug';
import { nanoid, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { createIndexedDBProvider } from '@toeverything/y-indexeddb';
import { createJSONStorage } from 'jotai/utils';
import { z } from 'zod';

import { createLocalProviders } from '../providers';
import type { LocalWorkspace, WorkspaceCRUD } from '../type';
import { WorkspaceFlavour } from '../type';
import { createEmptyBlockSuiteWorkspace } from '../utils';

const getStorage = () => createJSONStorage(() => localStorage);

const kStoreKey = 'affine-local-workspace';
const schema = z.array(z.string());

const logger = new DebugLogger('affine:workspace:local:crud');

/**
 * @internal
 */
export function saveWorkspaceToLocalStorage(workspaceId: string) {
  const storage = getStorage();
  !Array.isArray(storage.getItem(kStoreKey)) && storage.setItem(kStoreKey, []);
  const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
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
    !Array.isArray(storage.getItem(kStoreKey)) &&
      storage.setItem(kStoreKey, []);
    const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
    const id = data.find(id => id === workspaceId);
    if (!id) {
      return null;
    }
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      id,
      WorkspaceFlavour.LOCAL
    );
    const workspace: LocalWorkspace = {
      id,
      flavour: WorkspaceFlavour.LOCAL,
      blockSuiteWorkspace: blockSuiteWorkspace,
      providers: [...createLocalProviders(blockSuiteWorkspace)],
    };
    return workspace;
  },
  create: async ({ doc }) => {
    logger.debug('create', doc);
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey)) &&
      storage.setItem(kStoreKey, []);
    const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdateV2(doc);
    const id = nanoid();
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      id,
      WorkspaceFlavour.LOCAL
    );
    BlockSuiteWorkspace.Y.applyUpdateV2(blockSuiteWorkspace.doc, binary);
    const persistence = createIndexedDBProvider(id, blockSuiteWorkspace.doc);
    persistence.connect();
    await persistence.whenSynced.then(() => {
      persistence.disconnect();
    });
    saveWorkspaceToLocalStorage(id);
    return id;
  },
  delete: async workspace => {
    logger.debug('delete', workspace);
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey)) &&
      storage.setItem(kStoreKey, []);
    const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
    const idx = data.findIndex(id => id === workspace.id);
    if (idx === -1) {
      throw new Error('workspace not found');
    }
    data.splice(idx, 1);
    storage.setItem(kStoreKey, [...data]);
  },
  list: async () => {
    logger.debug('list');
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey)) &&
      storage.setItem(kStoreKey, []);
    return (
      await Promise.all(
        (storage.getItem(kStoreKey) as z.infer<typeof schema>).map(id =>
          CRUD.get(id)
        )
      )
    ).filter(item => item !== null) as LocalWorkspace[];
  },
};
