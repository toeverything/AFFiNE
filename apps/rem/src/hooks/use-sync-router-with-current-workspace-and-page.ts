import { NextRouter } from 'next/router';
import { useEffect } from 'react';

import { RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { useCurrentPageId } from './current/use-current-page-id';
import { useCurrentWorkspace } from './current/use-current-workspace';
import { useWorkspaces, useWorkspacesIsLoaded } from './use-workspaces';

export function findSuitablePageId(
  workspace: RemWorkspace,
  targetId: string
): string | null {
  switch (workspace.flavour) {
    case RemWorkspaceFlavour.AFFINE: {
      if (workspace.firstBinarySynced) {
        return (
          workspace.blockSuiteWorkspace.meta.pageMetas.find(
            page => page.id === targetId
          )?.id ??
          workspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id ??
          null
        );
      } else {
        return null;
      }
      break;
    }
    case RemWorkspaceFlavour.LOCAL: {
      return (
        workspace.blockSuiteWorkspace.meta.pageMetas.find(
          page => page.id === targetId
        )?.id ??
        workspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id ??
        null
      );
    }
  }
}

export function useSyncRouterWithCurrentWorkspaceAndPage(router: NextRouter) {
  const [currentWorkspace, setCurrentWorkspaceId] = useCurrentWorkspace();
  const [currentPageId, setCurrentPageId] = useCurrentPageId();
  const workspaces = useWorkspaces();
  const isLoaded = useWorkspacesIsLoaded();
  useEffect(() => {
    const listener: Parameters<typeof router.events.on>[1] = (url: string) => {
      if (url.startsWith('/')) {
        const path = url.split('/');
        if (path.length === 4 && path[1] === 'workspace') {
          if (
            path[3] === 'all' ||
            path[3] === 'setting' ||
            path[3] === 'trash' ||
            path[3] === 'favorite'
          ) {
            return;
          }
          setCurrentWorkspaceId(path[2]);
          if (currentWorkspace && 'blockSuiteWorkspace' in currentWorkspace) {
            if (currentWorkspace.blockSuiteWorkspace.getPage(path[3])) {
              setCurrentPageId(path[3]);
            }
          }
        }
      }
    };

    router.events.on('routeChangeStart', listener);
    return () => {
      router.events.off('routeChangeStart', listener);
    };
  }, [currentWorkspace, router, setCurrentPageId, setCurrentWorkspaceId]);
  useEffect(() => {
    if (!router.isReady || !isLoaded) {
      return;
    }
    if (
      router.pathname === '/workspace/[workspaceId]/[pageId]' ||
      router.pathname === '/'
    ) {
      const targetPageId = router.query.pageId;
      const targetWorkspaceId = router.query.workspaceId;
      if (currentWorkspace && currentPageId) {
        if (
          currentWorkspace.id === targetWorkspaceId &&
          currentPageId === targetPageId
        ) {
          return;
        }
      }
      if (
        typeof targetPageId !== 'string' ||
        typeof targetWorkspaceId !== 'string'
      ) {
        if (router.asPath === '/') {
          const first = workspaces.at(0);
          if (first && 'blockSuiteWorkspace' in first) {
            const targetWorkspaceId = first.id;
            const targetPageId =
              first.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
            if (targetPageId) {
              setCurrentWorkspaceId(targetWorkspaceId);
              setCurrentPageId(targetPageId);
              router.push(`/workspace/${targetWorkspaceId}/${targetPageId}`);
            }
          }
        }
        return;
      }
      if (!currentWorkspace) {
        const targetWorkspace = workspaces.find(
          workspace => workspace.id === targetPageId
        );
        if (targetWorkspace) {
          setCurrentWorkspaceId(targetWorkspace.id);
          router.push({
            query: {
              ...router.query,
              workspaceId: targetWorkspace.id,
            },
          });
          return;
        } else {
          const first = workspaces.at(0);
          if (first) {
            setCurrentWorkspaceId(first.id);
            router.push({
              query: {
                ...router.query,
                workspaceId: first.id,
              },
            });
            return;
          }
        }
      } else {
        if (!currentPageId && currentWorkspace) {
          if ('blockSuiteWorkspace' in currentWorkspace) {
            const targetId = findSuitablePageId(currentWorkspace, targetPageId);
            if (targetId) {
              setCurrentPageId(targetId);
              router.push({
                query: {
                  ...router.query,
                  workspaceId: currentWorkspace.id,
                  pageId: targetId,
                },
              });
              return;
            }
          }
        }
      }
    }
  }, [
    currentPageId,
    currentWorkspace,
    router.query.workspaceId,
    router.query.pageId,
    setCurrentPageId,
    setCurrentWorkspaceId,
    workspaces,
    router,
    isLoaded,
  ]);
}
