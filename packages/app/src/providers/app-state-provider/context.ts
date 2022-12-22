import { createContext, MutableRefObject, useContext } from 'react';
import type { Workspace } from '@pathfinder/data-services';
import { AccessTokenMessage } from '@pathfinder/data-services';
import type {
  Page as StorePage,
  Workspace as StoreWorkspace,
} from '@blocksuite/store';
import type { EditorContainer } from '@blocksuite/editor';
export type LoadWorkspaceHandler = (
  workspaceId: string,
  websocket?: boolean
) => Promise<StoreWorkspace | null> | null;
export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;

export interface AppStateValue {
  user: AccessTokenMessage | null;
  workspacesMeta: Workspace[];

  currentWorkspaceId: string;
  currentWorkspace: StoreWorkspace | null;

  currentPage: StorePage | null;

  editor: EditorContainer | null;
  synced: boolean;
  refreshWorkspacesMeta: () => void;
}

export interface AppStateContext extends AppStateValue {
  setState: (state: AppStateValue) => void;
  createEditor?: MutableRefObject<
    ((page: StorePage) => EditorContainer | null) | undefined
  >;
  setEditor?: MutableRefObject<((page: EditorContainer) => void) | undefined>;
  loadWorkspace: (workspaceId: string) => Promise<StoreWorkspace | null>;
  loadPage: (pageId: string) => Promise<StorePage | null>;
  createPage: (pageId?: string) => Promise<string | null>;
}

export const AppState = createContext<AppStateContext>({
  user: null,
  workspacesMeta: [],

  currentWorkspaceId: '',
  currentWorkspace: null,

  currentPage: null,

  editor: null,

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setState: () => {},
  createEditor: undefined,
  setEditor: undefined,
  loadWorkspace: () => Promise.resolve(null),
  loadPage: () => Promise.resolve(null),
  createPage: () => Promise.resolve(null),
  synced: false,
  refreshWorkspacesMeta: () => {},
});

export const useAppState = () => {
  return useContext(AppState);
};
