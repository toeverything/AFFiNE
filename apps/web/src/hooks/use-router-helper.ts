import type { WorkspaceSubPath } from '@affine/env/workspace';
import type { NextRouter } from 'next/router';
import { useCallback } from 'react';

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

export function useRouterHelper(router: NextRouter) {
  const jumpToPage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
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
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return router[logic]({
        pathname: `/public-workspace/[workspaceId]/[pageId]`,
        query: {
          workspaceId,
          pageId,
        },
      });
    },
    [router]
  );
  const jumpToSubPath = useCallback(
    (
      workspaceId: string,
      subPath: WorkspaceSubPath,
      logic: RouteLogic = RouteLogic.PUSH
    ): Promise<boolean> => {
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
    (workspaceId: string, pageId: string) => {
      const isPublicWorkspace =
        router.pathname.split('/')[1] === 'public-workspace';
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
