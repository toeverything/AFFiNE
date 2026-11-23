import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { toDocSearchParams } from '@affine/core/modules/navigation';
import { getOpenUrlInDesktopAppLink } from '@affine/core/modules/open-in-app';
import type { DocMode } from '@blocksuite/affine/model';
import { nanoid } from 'nanoid';
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

/**
 * In workbench, we use nested react-router, so default `useNavigate` can't get correct navigate function in workbench.
 * We use this context to provide navigate function for whole app.
 */
export const NavigateContext = createContext<NavigateFunction | null>(null);

export enum RouteLogic {
  REPLACE = 'replace',
  PUSH = 'push',
}

export type WorkspaceSettingsRouteOptions = {
  tab?: SettingTab;
  scrollAnchor?: string;
};

export type NavigateToPageOptions = Omit<NavigateOptions, 'replace'> & {
  search?: string | URLSearchParams;
};

const normalizeSearch = (search?: string | URLSearchParams) => {
  const value = search?.toString();
  if (!value) return '';
  return value.startsWith('?') ? value : `?${value}`;
};

export function buildWorkspaceSettingsPath(
  workspaceId: string,
  options?: WorkspaceSettingsRouteOptions
) {
  const searchParams = new URLSearchParams();
  if (options?.tab) {
    searchParams.set('tab', options.tab);
  }
  if (options?.scrollAnchor) {
    searchParams.set('scrollAnchor', options.scrollAnchor);
  }
  const query = searchParams.toString();
  return `/workspace/${workspaceId}/settings${query ? `?${query}` : ''}`;
}

export function buildWorkspaceSettingsRedirectUri(
  currentHref: string,
  options?: WorkspaceSettingsRouteOptions
): string {
  let currentUrl: URL;
  try {
    currentUrl = new URL(currentHref);
  } catch {
    return currentHref;
  }

  const pathSegments = currentUrl.pathname.split('/').filter(Boolean);
  const workspaceSegmentIndex = pathSegments.indexOf('workspace');
  const workspaceId = pathSegments[workspaceSegmentIndex + 1];

  if (workspaceSegmentIndex === -1 || !workspaceId) {
    return currentHref;
  }

  const basePath = pathSegments.slice(0, workspaceSegmentIndex).join('/');
  const redirectUrl = new URL(
    buildWorkspaceSettingsPath(workspaceId, options),
    currentUrl.origin
  );

  if (basePath) {
    redirectUrl.pathname = `/${basePath}${redirectUrl.pathname}`;
  }

  return redirectUrl.toString();
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

  const navigateTo = useCallback(
    (to: To, options?: NavigateOptions) => {
      Promise.resolve(navigate(to, options)).catch(console.error);
    },
    [navigate]
  );

  const jumpToPage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic: RouteLogic = RouteLogic.PUSH,
      options?: NavigateToPageOptions
    ) => {
      const { search, ...navigateOptions } = options ?? {};
      return navigateTo(
        `/workspace/${workspaceId}/${pageId}${normalizeSearch(search)}`,
        {
          ...navigateOptions,
          replace: logic === RouteLogic.REPLACE,
        }
      );
    },
    [navigateTo]
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
      const search = toDocSearchParams({
        mode,
        blockIds,
        elementIds,
        refreshKey: nanoid(),
      });
      const query = search?.size ? `?${search.toString()}` : '';
      return navigateTo(`/workspace/${workspaceId}/${pageId}${query}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
  );
  const jumpToPageComment = useCallback(
    (
      workspaceId: string,
      pageId: string,
      commentId: string,
      mode: DocMode,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      const search = toDocSearchParams({
        mode,
        refreshKey: nanoid(),
        commentId,
      });
      const query = search?.size ? `?${search.toString()}` : '';
      return navigateTo(`/workspace/${workspaceId}/${pageId}${query}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
  );
  const jumpToCollections = useCallback(
    (workspaceId: string, logic: RouteLogic = RouteLogic.PUSH) => {
      return navigateTo(`/workspace/${workspaceId}/collection`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
  );
  const jumpToTags = useCallback(
    (workspaceId: string, logic: RouteLogic = RouteLogic.PUSH) => {
      return navigateTo(`/workspace/${workspaceId}/tag`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
  );
  const jumpToTag = useCallback(
    (
      workspaceId: string,
      tagId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigateTo(`/workspace/${workspaceId}/tag/${tagId}`, {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
  );
  const jumpToCollection = useCallback(
    (
      workspaceId: string,
      collectionId: string,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      return navigateTo(
        `/workspace/${workspaceId}/collection/${collectionId}`,
        {
          replace: logic === RouteLogic.REPLACE,
        }
      );
    },
    [navigateTo]
  );

  const openPage = useCallback(
    (
      workspaceId: string,
      pageId: string,
      logic?: RouteLogic,
      options?: NavigateToPageOptions
    ) => {
      return jumpToPage(workspaceId, pageId, logic, options);
    },
    [jumpToPage]
  );

  const jumpToIndex = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH, opt?: { search?: string }) => {
      return navigateTo(
        { pathname: '/', search: opt?.search },
        {
          replace: logic === RouteLogic.REPLACE,
        }
      );
    },
    [navigateTo]
  );

  const jumpTo404 = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      return navigateTo('/404', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
  );
  const jumpToExpired = useCallback(
    (logic: RouteLogic = RouteLogic.PUSH) => {
      return navigateTo('/expired', {
        replace: logic === RouteLogic.REPLACE,
      });
    },
    [navigateTo]
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

      return navigateTo(
        '/sign-in' +
          (searchParams.toString() ? '?' + searchParams.toString() : ''),
        {
          replace: logic === RouteLogic.REPLACE,
          ...otherOptions,
        }
      );
    },
    [navigateTo]
  );

  const jumpToOpenInApp = useCallback(
    (url: string, newTab = true) => {
      const deeplink = getOpenUrlInDesktopAppLink(url, newTab);

      if (!deeplink) {
        return;
      }

      const encodedUrl = encodeURIComponent(deeplink);
      return navigateTo(`/open-app/url?url=${encodedUrl}`);
    },
    [navigateTo]
  );

  const jumpToImportTemplate = useCallback(
    (name: string, snapshotUrl: string) => {
      return navigateTo(
        `/template/import?name=${encodeURIComponent(name)}&snapshotUrl=${encodeURIComponent(snapshotUrl)}`
      );
    },
    [navigateTo]
  );

  const jumpToWorkspaceSettings = useCallback(
    (
      workspaceId: string,
      options?: WorkspaceSettingsRouteOptions | SettingTab,
      logic: RouteLogic = RouteLogic.PUSH
    ) => {
      const resolvedOptions =
        typeof options === 'string' ? { tab: options } : options;

      return navigateTo(
        buildWorkspaceSettingsPath(workspaceId, resolvedOptions),
        { replace: logic === RouteLogic.REPLACE }
      );
    },
    [navigateTo]
  );
  return useMemo(
    () => ({
      jumpToPage,
      jumpToPageBlock,
      jumpToPageComment,
      jumpToIndex,
      jumpTo404,
      openPage,
      jumpToExpired,
      jumpToSignIn,
      jumpToCollection,
      jumpToCollections,
      jumpToTags,
      jumpToTag,
      jumpToOpenInApp,
      jumpToImportTemplate,
      jumpToWorkspaceSettings,
    }),
    [
      jumpToPage,
      jumpToPageBlock,
      jumpToPageComment,
      jumpToIndex,
      jumpTo404,
      openPage,
      jumpToExpired,
      jumpToSignIn,
      jumpToCollection,
      jumpToCollections,
      jumpToTags,
      jumpToTag,
      jumpToOpenInApp,
      jumpToImportTemplate,
      jumpToWorkspaceSettings,
    ]
  );
}
