import { PropsWithChildren } from 'react';
import { Page } from '@blocksuite/store';
import { QueryContent } from '@blocksuite/store/dist/workspace/search';
import { PageMeta as OriginalPageMeta } from '@blocksuite/store';
import { EditorContainer } from '@blocksuite/editor';

export type EventCallBack<T> = (callback: (props: T) => void) => void;
export type EditorContextProps = PropsWithChildren<{}>;

export type EditorContextValue = {
  mode: EditorContainer['mode'];
  setMode: (mode: EditorContainer['mode']) => void;
  page: Page | void;
  editor: EditorContainer | void;
  pageList: PageMeta[];
  onHistoryUpdated: EventCallBack<Page>;
  onPropsUpdated: EventCallBack<EditorContainer>;
} & EditorHandlers;

export type PageMeta = {
  favorite: boolean;
  trash: boolean;
  trashDate: number | void;
  updatedDate: number | void;
  mode: EditorContainer['mode'];
} & OriginalPageMeta;

export type EditorHandlers = {
  createPage: (pageId?: string) => Promise<Page>;
  openPage: (
    pageId: string,
    query?: { [key: string]: string }
  ) => Promise<boolean>;
  getPageMeta: (pageId: string) => PageMeta | void;
  toggleDeletePage: (pageId: string) => void;
  favoritePage: (pageId: string) => void;
  unFavoritePage: (pageId: string) => void;
  toggleFavoritePage: (pageId: string) => void;
  permanentlyDeletePage: (pageId: string) => void;
  search: (query: QueryContent) => Map<string, string | undefined>;
  changeEditorMode: (pageId: string) => void;
};
