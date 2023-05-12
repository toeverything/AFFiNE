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
  []
);

// two more atoms to store the current workspace and page
export const rootCurrentWorkspaceIdAtom = atomWithStorage<string | null>(
  'root-current-workspace-id',
  null,
  createJSONStorage(() => sessionStorage)
);

rootCurrentWorkspaceIdAtom.onMount = set => {
  if (typeof window !== 'undefined') {
    const callback = () => {
      const value = window.location.pathname.split('/')[2];
      if (value) {
        set(value);
      } else {
        set(null);
      }
    };
    callback();
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }
};

export const rootCurrentPageIdAtom = atomWithStorage<string | null>(
  'root-current-page-id',
  null,
  createJSONStorage(() => sessionStorage)
);

rootCurrentPageIdAtom.onMount = set => {
  if (typeof window !== 'undefined') {
    const callback = () => {
      const value = window.location.pathname.split('/')[3];
      if (value) {
        set(value);
      } else {
        set(null);
      }
    };
    callback();
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }
};

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
