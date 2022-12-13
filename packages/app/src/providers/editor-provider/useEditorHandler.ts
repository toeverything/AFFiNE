import { QueryContent } from '@blocksuite/store/dist/workspace/search';
import { createPage, initialPage, generateDefaultPageId } from './utils';
import { Workspace } from '@blocksuite/store';
import { useRouter } from 'next/router';
import { EditorHandlers } from './interface';

export const useEditorHandler = (workspace?: Workspace): EditorHandlers => {
  const router = useRouter();

  return {
    createPage: async (pageId = generateDefaultPageId()) => {
      const page = await createPage(workspace!, pageId);
      initialPage(page);
      return page;
    },
    getPageMeta(pageId: string) {
      pageId = pageId.replace('space:', '');
      return workspace!.meta.pageMetas.find(page => page.id === pageId);
    },
    openPage: (pageId, query = {}) => {
      return router.push({
        pathname: '/',
        query: {
          pageId,
          ...query,
        },
      });
    },
    toggleDeletePage: pageId => {
      const pageMeta = workspace!.meta.pageMetas.find(p => p.id === pageId);
      if (pageMeta) {
        workspace!.meta.setPage(pageId, { trashDate: new Date().getTime() });
        workspace!.setPageMeta(pageId, { trash: !pageMeta.trash });
      }
    },
    favoritePage: pageId => {
      workspace!.setPageMeta(pageId, { favorite: true });
    },
    permanentlyDeletePage: pageId => {
      // TODO:  workspace.meta.removePage or workspace.removePage?
      workspace!.meta.removePage(pageId);
    },
    unFavoritePage: pageId => {
      workspace!.setPageMeta(pageId, { favorite: true });
    },
    toggleFavoritePage: pageId => {
      const pageMeta = workspace?.meta.pageMetas.find(p => p.id === pageId);
      if (pageMeta) {
        workspace!.setPageMeta(pageId, { favorite: !pageMeta.favorite });
      }
    },
    search: (query: QueryContent) => {
      return workspace!.search(query);
    },
  };
};

export default useEditorHandler;
