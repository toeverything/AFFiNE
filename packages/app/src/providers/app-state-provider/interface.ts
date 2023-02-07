import { DataCenter, User, WorkspaceUnit } from '@affine/datacenter';
import type { EditorContainer } from '@blocksuite/editor';

import type {
  Page as StorePage,
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
  workspaceList: WorkspaceUnit[];
  currentWorkspace: WorkspaceUnit | null;
  pageList: PageMeta[];
  currentPage: StorePage | null;
  editor?: EditorContainer | null;
  synced: boolean;
  isOwner?: boolean;
  blobDataSynced?: boolean;
};

export type AppStateFunction = {
  setEditor: MutableRefObject<(page: EditorContainer) => void>;

  loadWorkspace: (workspaceId: string) => Promise<WorkspaceUnit | null>;
  loadPage: (pageId: string) => void;

  login: () => Promise<User>;
  logout: () => Promise<void>;
};

export type AppStateContext = AppStateValue & AppStateFunction;

export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;
