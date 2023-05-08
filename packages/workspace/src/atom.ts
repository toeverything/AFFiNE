import type { EditorContainer } from '@blocksuite/editor';
import { atom, createStore } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

import type { WorkspaceFlavour } from './type';

export type RootWorkspaceMetadata = {
  id: string;
  flavour: WorkspaceFlavour;
};
// #region root atoms
// root primitive atom that stores the necessary data for the whole app
// be careful when you use this atom,
// it should be used only in the root component

// we use async storage to make sure the hydration is correct
// todo(pengx17): we could save the item to electron through IPC channel
export const asyncStorage = createJSONStorage<RootWorkspaceMetadata[]>(() => ({
  getItem: async (key: string) => {
    return localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    return localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    return localStorage.removeItem(key);
  },
}));

/**
 * root workspaces atom
 * this atom stores the metadata of all workspaces,
 * which is `id` and `flavor`, that is enough to load the real workspace data
 */
export const rootWorkspacesMetadataAtom = atomWithStorage<
  RootWorkspaceMetadata[]
>(
  // don't change this key,
  // otherwise it will cause the data loss in the production
  'jotai-workspaces',
  [],
  asyncStorage
);

// two more atoms to store the current workspace and page
export const rootCurrentWorkspaceIdAtom = atomWithStorage<string | null>(
  'root-current-workspace-id',
  null,
  createJSONStorage(() => sessionStorage)
);
export const rootCurrentPageIdAtom = atomWithStorage<string | null>(
  'root-current-page-id',
  null,
  createJSONStorage(() => sessionStorage)
);

// current editor atom, each app should have only one editor in the same time
export const rootCurrentEditorAtom = atom<Readonly<EditorContainer> | null>(
  null
);
//#endregion

const getStorage = () => createJSONStorage(() => localStorage);

export const getStoredWorkspaceMeta = () => {
  const storage = getStorage();
  return storage.getItem('jotai-workspaces', []) as RootWorkspaceMetadata[];
};

// global store
export const rootStore = createStore();
