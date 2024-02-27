import type { WorkspaceSubPath } from '@affine/core/shared';
import { useCallback, useMemo } from 'react';
import { type NavigateOptions, type To, useLocation } from 'react-router-dom';

import { router } from '../router';

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

function navigate(to: To, option?: { replace?: boolean }) {
  router.navigate(to, option).catch(err => {
    console.error('Failed to navigate', err);
  });
}

// todo: add a name -> path helper in the results
export function useNavigateHelper() {
  const location = useLocation();

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
    []
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
    []
  );
  const jumpToCollections = useCallback(
    (workspaceId: string, logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate(`/workspace/${workspaceId}/collection`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    []
  );
  const jumpToTags = useCallback(
    (workspaceId: string, logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate(`/workspace/${workspaceId}/tag`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    []
  );
  const jumpToTag = useCallback(
    (
      workspaceId: string,
      tagId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigate(`/workspace/${workspaceId}/tag/${tagId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    []
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
    []
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
    []
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
    []
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

  const jumpToIndex = useCallback((logic: RouteLogic = RouteLogic.PUSH) => {
    return navigate('/', {
      replace: logic === RouteLogic.REPLACE,
    });
  }, []);

  const jumpTo404 = useCallback((logic: RouteLogic = RouteLogic.PUSH) => {
    return navigate('/404', {
      replace: logic === RouteLogic.REPLACE,
    });
  }, []);
  const jumpToExpired = useCallback((logic: RouteLogic = RouteLogic.PUSH) => {
    return navigate('/expired', {
      replace: logic === RouteLogic.REPLACE,
    });
  }, []);
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
    []
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
      jumpToCollections,
      jumpToTags,
      jumpToTag,
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
      jumpToCollections,
      jumpToTags,
      jumpToTag,
    ]
  );
}
