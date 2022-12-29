import { createContext, MutableRefObject, useContext } from 'react';
import type { Workspace } from '@affine/datacenter';
import { AccessTokenMessage } from '@affine/datacenter';
import type {
  Page as StorePage,
  Workspace as StoreWorkspace,
} from '@blocksuite/store';
import type { EditorContainer } from '@blocksuite/editor';
export type LoadWorkspaceHandler = (
  workspaceId: string,
  websocket?: boolean,
  user?: AccessTokenMessage | null
) => Promise<StoreWorkspace | null> | null;
export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;

export interface AppStateValue {
  user: AccessTokenMessage | null;
  workspacesMeta: Workspace[];

  currentWorkspaceId: string;
  currentWorkspace: StoreWorkspace | null;

  currentPage: StorePage | null;

  workspaces: Record<string, StoreWorkspace | null>;

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
  synced: false,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  refreshWorkspacesMeta: () => {},
  workspaces: {},
});

export const useAppState = () => {
  return useContext(AppState);
};
