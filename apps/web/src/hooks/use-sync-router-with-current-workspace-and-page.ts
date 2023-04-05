import { jotaiStore } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

import { currentPageIdAtom } from '../atoms';
import type { AllWorkspace } from '../shared';
import { WorkspaceSubPath } from '../shared';
import { useCurrentPageId } from './current/use-current-page-id';
import { useCurrentWorkspace } from './current/use-current-workspace';
import { RouteLogic, useRouterHelper } from './use-router-helper';
import { useWorkspaces } from './use-workspaces';

export function findSuitablePageId(
  workspace: AllWorkspace,
  targetId: string
): string | null {
  switch (workspace.flavour) {
    case WorkspaceFlavour.AFFINE: {
      return (
        workspace.blockSuiteWorkspace.meta.pageMetas.find(
          page => page.id === targetId
        )?.id ??
        workspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id ??
        null
      );
    }
    case WorkspaceFlavour.LOCAL: {
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

export const REDIRECT_TIMEOUT = 1000;
export function useSyncRouterWithCurrentWorkspaceAndPage(router: NextRouter) {
  const [currentWorkspace, setCurrentWorkspaceId] = useCurrentWorkspace();
  const [currentPageId, setCurrentPageId] = useCurrentPageId();
  const workspaces = useWorkspaces();
  const { jumpToSubPath } = useRouterHelper(router);
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
    if (!router.isReady) {
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
          } else {
            const dispose =
              currentWorkspace.blockSuiteWorkspace.slots.pageAdded.on(
                pageId => {
                  if (pageId === targetPageId) {
                    dispose.dispose();
                    setCurrentPageId(pageId);
                    router.push({
                      query: {
                        ...router.query,
                        workspaceId: currentWorkspace.id,
                        pageId: targetPageId,
                      },
                    });
                  }
                }
              );
            const clearId = setTimeout(() => {
              const pageId = jotaiStore.get(currentPageIdAtom);
              if (pageId === null) {
                const id =
                  currentWorkspace.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
                if (id) {
                  router.push({
                    query: {
                      ...router.query,
                      workspaceId: currentWorkspace.id,
                      pageId: id,
                    },
                  });
                  setCurrentPageId(id);
                  dispose.dispose();
                  return;
                }
              }
              jumpToSubPath(
                currentWorkspace.blockSuiteWorkspace.id,
                WorkspaceSubPath.ALL,
                RouteLogic.REPLACE
              );
              dispose.dispose();
            }, REDIRECT_TIMEOUT);
            return () => {
              clearTimeout(clearId);
              dispose.dispose();
            };
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
    jumpToSubPath,
  ]);
}
