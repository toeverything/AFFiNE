import { Page } from '@blocksuite/store';
import { QueryContent } from '@blocksuite/store/dist/workspace/search';
import { PageMeta } from '@/providers/editor-provider';
import { useAppState } from '@/providers/app-state-provider';

export type EditorHandlers = {
  // createPage: (params?: { pageId?: string; title?: string }) => Promise<Page>;
  // openPage: (
  //   pageId: string,
  //   query?: { [key: string]: string }
  // ) => Promise<boolean>;
  // getPageMeta: (pageId?: string) => PageMeta;
  toggleDeletePage: (pageId: string) => void;
  toggleFavoritePage: (pageId: string) => void;
  // permanentlyDeletePage: (pageId: string) => void;
  search: (query: QueryContent) => Map<string, string | undefined>;
  // changeEditorMode: (pageId: string) => void;
};

export const usePageHelper = (): EditorHandlers => {
  const { currentWorkspace } = useAppState();

  return {
    toggleFavoritePage: (pageId: string) => {
      if (!currentWorkspace) {
        return;
      }
      const pageMeta = currentWorkspace.meta.pageMetas.find(
        p => p.id === pageId
      );
      if (pageMeta) {
        currentWorkspace.setPageMeta(pageId, {
          favorite: !pageMeta.favorite,
        });
      }
    },
    toggleDeletePage: (pageId: string) => {
      const pageMeta = currentWorkspace?.meta.pageMetas.find(
        p => p.id === pageId
      );
      if (pageMeta) {
        currentWorkspace!.setPageMeta(pageId, {
          trash: !pageMeta.trash,
          trashDate: +new Date(),
        });
      }
    },
    search: (query: QueryContent) => {
      return currentWorkspace!.search(query);
    },
  };
};
