import type { EditorContainer } from '@blocksuite/editor';

import type {
  Page as StorePage,
  PageMeta as StorePageMeta,
} from '@blocksuite/store';

export interface PageMeta extends StorePageMeta {
  favorite: boolean;
  trash: boolean;
  trashDate: number;
  updatedDate: number;
  mode: 'edgeless' | 'page';
}

export type AppStateValue = {
  blobDataSynced: boolean;
};

/**
 * @deprecated
 */
export type AppStateFunction = {
  // todo: remove this in the future
};

export type AppStateContext = AppStateValue & AppStateFunction;

export type CreateEditorHandler = (page: StorePage) => EditorContainer | null;
