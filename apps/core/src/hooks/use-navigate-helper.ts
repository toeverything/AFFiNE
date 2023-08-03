import type { WorkspaceSubPath } from '@affine/env/workspace';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useLocation, useNavigate } from 'react-router-dom';

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

export function useNavigateHelper() {
  const location = useLocation();
  const navigate = useNavigate();
  const setWorkspaceId = useSetAtom(currentWorkspaceIdAtom);
  const setCurrentPageId = useSetAtom(currentPageIdAtom);

  const jumpToPage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      setWorkspaceId(workspaceId);
      setCurrentPageId(pageId);
      return navigate(`/workspace/${workspaceId}/${pageId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate, setCurrentPageId, setWorkspaceId]
  );
  const jumpToPublicWorkspacePage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      setWorkspaceId(workspaceId);
      setCurrentPageId(pageId);
      return navigate(`/public-workspace/${workspaceId}/${pageId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate, setCurrentPageId, setWorkspaceId]
  );
  const jumpToSubPath = useCallback(
    (
      workspaceId: string,
      subPath: WorkspaceSubPath,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      setWorkspaceId(workspaceId);
      setCurrentPageId(null);
      return navigate(`/workspace/${workspaceId}/${subPath}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate, setCurrentPageId, setWorkspaceId]
  );
  const openPage = useCallback(
    (workspaceId: string, pageId: string) => {
      setWorkspaceId(workspaceId);
      setCurrentPageId(pageId);
      const isPublicWorkspace =
        location.pathname.indexOf('/public-workspace') === 0;
      if (isPublicWorkspace) {
        return jumpToPublicWorkspacePage(workspaceId, pageId);
      } else {
        return jumpToPage(workspaceId, pageId);
      }
    },
    [
      jumpToPage,
      jumpToPublicWorkspacePage,
      location.pathname,
      setCurrentPageId,
      setWorkspaceId,
    ]
  );

  const jumpToIndex = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      setWorkspaceId(null);
      setCurrentPageId(null);
      return navigate('/', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate, setCurrentPageId, setWorkspaceId]
  );

  const jumpTo404 = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      setWorkspaceId(null);
      setCurrentPageId(null);
      return navigate('/404', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate, setCurrentPageId, setWorkspaceId]
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
