import { isBrowser } from '@affine/env/constant';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceVersion } from '@affine/env/workspace';
import type { EditorContainer } from '@blocksuite/editor';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Router from 'next/router';

export type RootWorkspaceMetadataV2 = {
  id: string;
  flavour: WorkspaceFlavour;
  version: WorkspaceVersion;
};

export type RootWorkspaceMetadataV1 = {
  id: string;
  flavour: WorkspaceFlavour;
  // force type check
  version: undefined;
};

export type RootWorkspaceMetadata =
  | RootWorkspaceMetadataV1
  | RootWorkspaceMetadataV2;

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
export const rootCurrentWorkspaceIdAtom = atom<string | null>(null);

rootCurrentWorkspaceIdAtom.onMount = set => {
  if (isBrowser) {
    const callback = (url: string) => {
      const value = url.split('/')[2];
      if (value) {
        set(value);
        localStorage.setItem('last_workspace_id', value);
      } else {
        set(null);
      }
    };
    callback(window.location.pathname);
    Router.events.on('routeChangeStart', callback);
    return () => {
      Router.events.off('routeChangeStart', callback);
    };
  }
  return;
};

export const rootCurrentPageIdAtom = atom<string | null>(null);

rootCurrentPageIdAtom.onMount = set => {
  if (isBrowser) {
    const callback = (url: string) => {
      const value = url.split('/')[3];
      if (value) {
        set(value);
      } else {
        set(null);
      }
    };
    callback(window.location.pathname);
    Router.events.on('routeChangeStart', callback);
    return () => {
      Router.events.off('routeChangeStart', callback);
    };
  }
  return;
};

// current editor atom, each app should have only one editor in the same time
export const rootCurrentEditorAtom = atom<Readonly<EditorContainer> | null>(
  null
);
//#endregion
