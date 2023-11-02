import type { WorkspaceSubPath } from '@affine/env/workspace';
import { useCallback, useMemo } from 'react';
import {
  type NavigateOptions,
  useLocation,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  useNavigate,
} from 'react-router-dom';

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

// todo: add a name -> path helper in the results
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
  const jumpToPageBlock = useCallback(
    (
      workspaceId: string,
      pageId: string,
      blockId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigate(`/workspace/${workspaceId}/${pageId}#${blockId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const jumpToCollection = useCallback(
    (
      workspaceId: string,
      collectionId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigate(`/workspace/${workspaceId}/collection/${collectionId}`, {
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

  const isPublicWorkspace = useMemo(() => {
    return location.pathname.indexOf('/public-workspace') === 0;
  }, [location.pathname]);

  const openPage = useCallback(
    (workspaceId: string, pageId: string) => {
      if (isPublicWorkspace) {
        return jumpToPublicWorkspacePage(workspaceId, pageId);
      } else {
        return jumpToPage(workspaceId, pageId);
      }
    },
    [jumpToPage, jumpToPublicWorkspacePage, isPublicWorkspace]
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
  const jumpToExpired = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate('/expired', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const jumpToSignIn = useCallback(
    (
      logic: RouteLogic = RouteLogic.PUSH,
      otherOptions?: Omit<NavigateOptions, 'replace'>
    ) => {
      return navigate('/signIn', {
        replace: logic === RouteLogic.REPLACE,
        ...otherOptions,
      });
    },
    [navigate]
  );

  return useMemo(
    () => ({
      jumpToPage,
      jumpToPageBlock,
      jumpToPublicWorkspacePage,
      jumpToSubPath,
      jumpToIndex,
      jumpTo404,
      openPage,
      jumpToExpired,
      jumpToSignIn,
      jumpToCollection,
    }),
    [
      jumpToPage,
      jumpToPageBlock,
      jumpToPublicWorkspacePage,
      jumpToSubPath,
      jumpToIndex,
      jumpTo404,
      openPage,
      jumpToExpired,
      jumpToSignIn,
      jumpToCollection,
    ]
  );
}
