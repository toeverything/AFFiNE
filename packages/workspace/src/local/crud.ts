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

export const CRUD: WorkspaceCRUD<WorkspaceFlavour.LOCAL> = {
  get: async workspaceId => {
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
      (_: string) => undefined
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
    const storage = getStorage();
    !Array.isArray(storage.getItem(kStoreKey)) &&
      storage.setItem(kStoreKey, []);
    const data = storage.getItem(kStoreKey) as z.infer<typeof schema>;
    const binary = BlockSuiteWorkspace.Y.encodeStateAsUpdateV2(doc);
    const id = nanoid();
    const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      id,
      (_: string) => undefined
    );
    BlockSuiteWorkspace.Y.applyUpdateV2(blockSuiteWorkspace.doc, binary);
    const persistence = createIndexedDBProvider(id, blockSuiteWorkspace.doc);
    persistence.connect();
    await persistence.whenSynced.then(() => {
      persistence.disconnect();
    });
    storage.setItem(kStoreKey, [...data, id]);
    console.log('create', id, storage.getItem(kStoreKey));
    return id;
  },
  delete: async workspace => {
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
