import { createContext, useContext } from 'react';
import type { Workspace } from '@pathfinder/data-services';
import { AccessTokenMessage } from '@pathfinder/data-services';
import type {
  Page as StorePage,
  PageMeta,
  Workspace as StoreWorkspace,
} from '@blocksuite/store';
import type { EditorContainer } from '@blocksuite/editor';
import { QueryContent } from '@blocksuite/store/dist/workspace/search';

export interface AppStateValue {
  user: AccessTokenMessage | null;
  workspacesMeta: Workspace[];

  currentWorkspaceId: string;
  currentWorkspace: StoreWorkspace | null;

  currentPage: StorePage | null;

  editor: EditorContainer | null;
}

export interface AppStateContext extends AppStateValue {
  setState: (state: AppStateValue) => void;
  createEditor: (page: StorePage) => EditorContainer | null;
  setEditor: (editor: EditorContainer) => void;
  loadWorkspace?: (
    workspaceId: string
  ) => Promise<StoreWorkspace | null> | null;
  loadPage: (pageId: string) => Promise<StorePage | null> | null;
  createPage: (pageId?: string) => Promise<string | null> | null;
  getPageMeta: (pageId: string) => PageMeta | null;
  toggleFavoritePage: (pageId: string) => void;
  toggleDeletePage: (pageId: string) => void;
  search: (query: QueryContent) => Map<string, string | undefined>;
}

export const AppState = createContext<AppStateContext>({
  user: null,
  workspacesMeta: [],

  currentWorkspaceId: '',
  currentWorkspace: null,

  currentPage: null,

  editor: null,

  setState: () => {},
  createEditor: () => null,
  setEditor: () => {},
  loadWorkspace: undefined,
  loadPage: () => null,
  createPage: () => null,
  getPageMeta: () => null,
  toggleFavoritePage: () => {},
  toggleDeletePage: () => {},
  search: () => new Map<string, string>(),
});

export const useAppState = () => {
  return useContext(AppState);
};
