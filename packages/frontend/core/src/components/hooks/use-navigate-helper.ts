import { toURLSearchParams } from '@affine/core/modules/navigation/utils';
import type { DocMode } from '@blocksuite/affine/blocks';
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { NavigateFunction, NavigateOptions } from 'react-router-dom';

/**
 * In workbench, we use nested react-router, so default `useNavigate` can't get correct navigate function in workbench.
 * We use this context to provide navigate function for whole app.
 */
export const NavigateContext = createContext<NavigateFunction | null>(null);

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

// TODO(@eyhn): add a name -> path helper in the results
/**
 * Use this for over workbench navigate, for navigate in workbench, use `WorkbenchService`.
 */
export function useNavigateHelper() {
  const navigate = useContext(NavigateContext);

  if (!navigate) {
    throw new Error('useNavigateHelper must be used within a NavigateProvider');
  }

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
      mode?: DocMode,
      blockIds?: string[],
      elementIds?: string[],
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      const search = toURLSearchParams({ mode, blockIds, elementIds });
      const query = search?.size ? `?${search.toString()}` : '';
      return navigate(`/workspace/${workspaceId}/${pageId}${query}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const jumpToCollections = useCallback(
    (workspaceId: string, logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate(`/workspace/${workspaceId}/collection`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
  );
  const jumpToTags = useCallback(
    (workspaceId: string, logic: RouteLogic = RouteLogic.PUSH) => {
      return navigate(`/workspace/${workspaceId}/tag`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigate]
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

  const openPage = useCallback(
    (workspaceId: string, pageId: string, logic?: RouteLogic) => {
      return jumpToPage(workspaceId, pageId, logic);
    },
    [jumpToPage]
  );

  const jumpToIndex = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH, opt?: { search?: string }) => {
      return navigate(
        { pathname: '/', search: opt?.search },
        {
          replace: logic === RouteLogic.REPLACE,
        }
      );
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
      redirectUri?: string,
      logic: RouteLogic = RouteLogic.PUSH,
      otherOptions?: Omit<NavigateOptions, 'replace'>,
      params?: Record<string, string>
    ) => {
      const searchParams = new URLSearchParams();

      if (redirectUri) {
        searchParams.set('redirect_uri', redirectUri);
      }

      if (params) {
        for (const key in params) searchParams.set(key, params[key]);
      }

      return navigate(
        '/sign-in' +
          (searchParams.toString() ? '?' + searchParams.toString() : ''),
        {
          replace: logic === RouteLogic.REPLACE,
          ...otherOptions,
        }
      );
    },
    [navigate]
  );

  const openInApp = useCallback(
    (schema: string, path: string) => {
      const encodedUrl = encodeURIComponent(`${schema}://${path}`);
      return navigate(`/open-app/url?schema=${schema}&url=${encodedUrl}`);
    },
    [navigate]
  );

  const jumpToImportTemplate = useCallback(
    (name: string, snapshotUrl: string) => {
      return navigate(
        `/template/import?name=${encodeURIComponent(name)}&snapshotUrl=${encodeURIComponent(snapshotUrl)}`
      );
    },
    [navigate]
  );

  return useMemo(
    () => ({
      jumpToPage,
      jumpToPageBlock,
      jumpToIndex,
      jumpTo404,
      openPage,
      jumpToExpired,
      jumpToSignIn,
      jumpToCollection,
      jumpToCollections,
      jumpToTags,
      jumpToTag,
      openInApp,
      jumpToImportTemplate,
    }),
    [
      jumpToPage,
      jumpToPageBlock,
      jumpToIndex,
      jumpTo404,
      openPage,
      jumpToExpired,
      jumpToSignIn,
      jumpToCollection,
      jumpToCollections,
      jumpToTags,
      jumpToTag,
      openInApp,
      jumpToImportTemplate,
    ]
  );
}
