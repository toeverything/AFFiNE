import { Workspace } from '@blocksuite/store';
import { QueryContent } from '@blocksuite/store/dist/workspace/search';
import { PageMeta, useAppState } from '@/providers/app-state-provider';
import { EditorContainer } from '@blocksuite/editor';
import { useChangePageMeta } from '@/hooks/use-change-page-meta';
import { useRouter } from 'next/router';

export type EditorHandlers = {
  // createPage: (params?: { pageId?: string; title?: string }) => Promise<Page>;
  openPage: (
    pageId: string,
    query?: { [key: string]: string }
  ) => Promise<boolean>;
  getPageMeta: (pageId: string) => PageMeta | null;
  toggleDeletePage: (pageId: string) => Promise<boolean>;
  toggleFavoritePage: (pageId: string) => Promise<boolean>;
  permanentlyDeletePage: (pageId: string) => void;
  search: (query: QueryContent) => Map<string, string | undefined>;
  // changeEditorMode: (pageId: string) => void;
  changePageMode: (
    pageId: string,
    mode: EditorContainer['mode']
  ) => Promise<EditorContainer['mode']>;
};

const getPageMeta = (workspace: Workspace | null, pageId: string) => {
  return workspace?.meta.pageMetas.find(p => p.id === pageId);
};
export const usePageHelper = (): EditorHandlers => {
  const router = useRouter();
  const changePageMeta = useChangePageMeta();
  const { currentWorkspace, editor, currentWorkspaceId } = useAppState();

  return {
    toggleFavoritePage: async pageId => {
      const pageMeta = getPageMeta(currentWorkspace, pageId);
      if (!pageMeta) {
        return Promise.reject('No page');
      }
      const favorite = !pageMeta.favorite;
      changePageMeta(pageMeta.id, {
        favorite,
      });
      return favorite;
    },
    toggleDeletePage: async pageId => {
      const pageMeta = getPageMeta(currentWorkspace, pageId);

      if (!pageMeta) {
        return Promise.reject('No page');
      }
      const trash = !pageMeta.trash;

      changePageMeta(pageMeta.id, {
        trash,
        trashDate: +new Date(),
      });
      return trash;
    },
    search: (query: string) => {
      return currentWorkspace!.search(query);
    },
    changePageMode: async (pageId, mode) => {
      const pageMeta = getPageMeta(currentWorkspace, pageId);
      if (!pageMeta) {
        return Promise.reject('No page');
      }

      editor?.setAttribute('mode', mode as string);

      changePageMeta(pageMeta.id, {
        mode,
      });
      return mode;
    },
    permanentlyDeletePage: pageId => {
      // TODO:  workspace.meta.removePage or workspace.removePage?
      currentWorkspace!.meta.removePage(pageId);
    },
    openPage: (pageId, query = {}) => {
      pageId = pageId.replace('space:', '');
      return router.push({
        pathname: `/workspace/${currentWorkspaceId}/${pageId}`,
        query,
      });
    },
    getPageMeta: pageId => {
      if (!currentWorkspace) {
        return null;
      }

      return (
        (currentWorkspace.meta.pageMetas.find(
          page => page.id === pageId
        ) as PageMeta) || null
      );
    },
  };
};
