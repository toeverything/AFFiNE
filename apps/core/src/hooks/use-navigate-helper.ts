import type { WorkspaceSubPath } from '@affine/env/workspace';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

export function useNavigateHelper() {
  const location = useLocation();
  const navigate = useNavigate();
  const jumpToPage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigate(`/workspace/${workspaceId}/${pageId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const jumpToPublicWorkspacePage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigate(`/public-workspace/${workspaceId}/${pageId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const jumpToSubPath = useCallback(
    (
      workspaceId: string,
      subPath: WorkspaceSubPath,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigate(`/workspace/${workspaceId}/${subPath}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const openPage = useCallback(
    (workspaceId: string, pageId: string) => {
      const isPublicWorkspace =
        location.pathname.indexOf('/public-workspace') === 0;
      if (isPublicWorkspace) {
        return jumpToPublicWorkspacePage(workspaceId, pageId);
      } else {
        return jumpToPage(workspaceId, pageId);
      }
    },
    [jumpToPage, jumpToPublicWorkspacePage, location.pathname]
  );

  const jumpToIndex = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate('/', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );

  const jumpTo404 = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate('/404', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );

  return {
    jumpToPage,
    jumpToPublicWorkspacePage,
    jumpToSubPath,
    jumpToIndex,
    jumpTo404,
    openPage,
  };
}
