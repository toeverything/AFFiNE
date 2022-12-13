import { Page } from '@blocksuite/store';
import { QueryContent } from '@blocksuite/store/dist/workspace/search';

export interface PageMeta {
  id: string;
  title: string;
  favorite: boolean;
  trash: boolean;
  createDate: number;
  trashDate: number | null;
}

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
  search: (query: QueryContent) => Map<string, string>;
};
