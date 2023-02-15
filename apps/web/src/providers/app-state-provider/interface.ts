import { WorkspaceUnit } from '@affine/datacenter';
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
  workspaceList: WorkspaceUnit[];
  currentWorkspace: WorkspaceUnit | null;
  pageList: PageMeta[];
  blobDataSynced?: boolean;
};

export type AppStateFunction = {
  loadWorkspace: MutableRefObject<
    (workspaceId: string, abort?: AbortSignal) => Promise<WorkspaceUnit | null>
  >;
};

export type AppStateContext = AppStateValue & AppStateFunction;

export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;
