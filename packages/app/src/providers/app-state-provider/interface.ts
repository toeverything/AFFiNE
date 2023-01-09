import { DataCenter, User, Workspace } from '@affine/datacenter';
import type { EditorContainer } from '@blocksuite/editor';

import type {
  Page as StorePage,
  Workspace as StoreWorkspace,
  PageMeta,
} from '@blocksuite/store';

export type AppStateValue = {
  dataCenter: DataCenter;
  user: User | undefined;
  workspaceList: Workspace[];
  currentWorkspace: StoreWorkspace;
  currentWorkspaceId: string;
  pageList: PageMeta[];
  currentPage: StorePage | null;
  editor?: EditorContainer | null;
  synced: boolean;
};

export type AppStateFunction = {
  createEditor: (page: StorePage) => EditorContainer | null;
  setEditor: (page: EditorContainer) => void;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  loadPage: (pageId: string) => void;
  createWorkspace: (name: string) => Promise<void>;
};

export type AppStateContext = AppStateValue & AppStateFunction;

export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;
