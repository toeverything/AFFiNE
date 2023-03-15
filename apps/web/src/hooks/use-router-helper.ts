import type { NextRouter } from 'next/router';
import { useMemo } from 'react';

import type { WorkspaceSubPath } from '../shared';

export const enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

export function useRouterHelper(router: NextRouter) {
  return useMemo(
    () => ({
      jumpToPage: (
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
      jumpToPublicWorkspacePage: (
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
      jumpToSubPath: (
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
    }),
    [router]
  );
}
