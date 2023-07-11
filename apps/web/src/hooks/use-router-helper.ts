import type { WorkspaceSubPath } from '@affine/env/workspace';
import type { NextRouter } from 'next/router';
import { useCallback } from 'react';

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
  NEW_TAB = 'newTab',
}

export function useRouterHelper(router: NextRouter) {
  const jumpToPage = useCallback(
    async (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      if (logic === RouteLogic.NEW_TAB) {
        return window
          .open(`/workspace/${workspaceId}/${pageId}`, '_blank')
          ?.focus();
      }
      return router[logic]({
        pathname: `/workspace/[workspaceId]/[pageId]`,
        query: {
          workspaceId,
          pageId,
        },
      });
    },
    [router]
  );
  const jumpToPublicWorkspacePage = useCallback(
    async (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      if (logic === RouteLogic.NEW_TAB) {
        return window
          .open(`/share/${workspaceId}/${pageId}`, '_blank')
          ?.focus();
      }
      return router[logic]({
        pathname: `/share/[workspaceId]/[pageId]`,
        query: {
          workspaceId,
          pageId,
        },
      });
    },
    [router]
  );
  const jumpToSubPath = useCallback(
    async (
      workspaceId: string,
      subPath: WorkspaceSubPath,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      if (logic === RouteLogic.NEW_TAB) {
        return window
          .open(`/workspace/${workspaceId}/${subPath}`, '_blank')
          ?.focus();
      }
      return router[logic]({
        pathname: `/workspace/[workspaceId]/${subPath}`,
        query: {
          workspaceId,
        },
      });
    },
    [router]
  );
  const openPage = useCallback(
    async (workspaceId: string, pageId: string) => {
      const isPublicWorkspace = router.pathname.split('/')[1] === 'share';
      if (isPublicWorkspace) {
        return jumpToPublicWorkspacePage(workspaceId, pageId);
      } else {
        return jumpToPage(workspaceId, pageId);
      }
    },
    [jumpToPage, jumpToPublicWorkspacePage, router.pathname]
  );

  return {
    jumpToPage,
    jumpToPublicWorkspacePage,
    jumpToSubPath,
    openPage,
  };
}
