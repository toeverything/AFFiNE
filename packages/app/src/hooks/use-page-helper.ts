import { uuidv4 } from '@blocksuite/store';
import { QueryContent } from '@blocksuite/store/dist/workspace/search';
import { PageMeta, useAppState } from '@/providers/app-state-provider';
import { EditorContainer } from '@blocksuite/editor';
import { useChangePageMeta } from '@/hooks/use-change-page-meta';
import { useRouter } from 'next/router';
import { WorkspaceUnit } from '@affine/datacenter';

export type EditorHandlers = {
  createPage: (params?: {
    pageId?: string;
    title?: string;
  }) => Promise<string | null>;
  openPage: (
    pageId: string,
    query?: { [key: string]: string },
    newTab?: boolean
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

const getPageMeta = (workspace: WorkspaceUnit | null, pageId: string) => {
  return workspace?.blocksuiteWorkspace?.meta.pageMetas.find(
    p => p.id === pageId
  );
};
export const usePageHelper = (): EditorHandlers => {
  const router = useRouter();
  const changePageMeta = useChangePageMeta();
  const { currentWorkspace, editor } = useAppState();

  return {
    createPage: ({
      pageId = uuidv4().replaceAll('-', ''),
      title = '',
    } = {}) => {
      return new Promise(resolve => {
        if (!currentWorkspace) {
          return resolve(null);
        }
        currentWorkspace.blocksuiteWorkspace?.createPage(pageId);
        currentWorkspace.blocksuiteWorkspace?.signals.pageAdded.once(
          addedPageId => {
            currentWorkspace.blocksuiteWorkspace?.setPageMeta(addedPageId, {
              title,
            });
            resolve(addedPageId);
          }
        );
      });
    },
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
    search: (query: QueryContent) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return currentWorkspace!.blocksuiteWorkspace!.search(query);
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      currentWorkspace!.blocksuiteWorkspace?.meta.removePage(pageId);
    },
    openPage: (pageId, query = {}, newTab = false) => {
      pageId = pageId.replace('space:', '');

      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
        return Promise.resolve(true);
      }
      return router.push({
        pathname: `/workspace/${currentWorkspace?.id}/${pageId}`,
        query,
      });
    },
    getPageMeta: pageId => {
      if (!currentWorkspace) {
        return null;
      }

      return (
        (currentWorkspace.blocksuiteWorkspace?.meta.pageMetas.find(
          page => page.id === pageId
        ) as PageMeta) || null
      );
    },
  };
};

export default usePageHelper;
