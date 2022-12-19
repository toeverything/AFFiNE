import { createContext, useContext } from 'react';
import { AccessTokenMessage } from '@pathfinder/data-services';
import type { Workspace } from '@pathfinder/data-services';
import type {
  Workspace as StoreWorkspace,
  Page as StorePage,
} from '@blocksuite/store';
import type { EditorContainer } from '@blocksuite/editor';

export interface AppStateValue {
  user: AccessTokenMessage | null;
  workspacesMeta: Workspace[];

  currentWorkspaceId: string;
  currentWorkspace: StoreWorkspace | null;

  currentPage: StorePage | null;
}

export interface AppStateContext extends AppStateValue {
  setState: (state: AppStateValue) => void;
  createEditor: (page: StorePage) => EditorContainer | null;
  loadWorkspace?: (
    workspaceId: string
  ) => Promise<StoreWorkspace | null> | null;
  loadPage: (pageId: string) => Promise<StorePage | null> | null;
  createPage: (pageId?: string) => Promise<string | null> | null;
}

export const AppState = createContext<AppStateContext>({
  user: null,
  workspacesMeta: [],

  currentWorkspaceId: '',
  currentWorkspace: null,

  currentPage: null,

  setState: () => {},
  createEditor: () => null,
  loadWorkspace: undefined,
  loadPage: () => null,
  createPage: () => null,
});

export const useAppState = () => {
  const state = useContext(AppState);
  return state;
};
