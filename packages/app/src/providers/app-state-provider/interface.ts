import { DataCenter, User, WorkspaceInfo } from '@affine/datacenter';
import type { EditorContainer } from '@blocksuite/editor';

import type {
  Page as StorePage,
  Workspace as StoreWorkspace,
  PageMeta as StorePageMeta,
} from '@blocksuite/store';
import { MutableRefObject } from 'react';
export interface PageMeta extends StorePageMeta {
  favorite: boolean;
  trash: boolean;
  trashDate: number;
  updatedDate: number;
  mode: 'edgeless' | 'page';
}

export type AppStateValue = {
  dataCenter: DataCenter;
  user: User | null;
  workspaceList: WorkspaceInfo[];
  currentWorkspace: StoreWorkspace | null;
  currentMetaWorkSpace: WorkspaceInfo | null;
  currentWorkspaceId: string;
  pageList: PageMeta[];
  currentPage: StorePage | null;
  editor?: EditorContainer | null;
  synced: boolean;
};

export type AppStateFunction = {
  setEditor: MutableRefObject<(page: EditorContainer) => void>;

  loadWorkspace: (workspaceId: string) => Promise<StoreWorkspace | null>;
  loadPage: (pageId: string) => void;
};

export type AppStateContext = AppStateValue & AppStateFunction;

export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;
