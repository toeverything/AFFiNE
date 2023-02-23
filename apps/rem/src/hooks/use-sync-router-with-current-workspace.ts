import { NextRouter } from 'next/router';
import { startTransition, useEffect } from 'react';

import { RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { useCurrentPageId } from './current/use-current-page-id';
import { useCurrentWorkspace } from './current/use-current-workspace';
import { useWorkspaces } from './use-workspaces';

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

export function useSyncRouterWithCurrentWorkspace(router: NextRouter) {
  const [currentWorkspace, setCurrentWorkspaceId] = useCurrentWorkspace();
  const [currentPageId, setCurrentPageId] = useCurrentPageId();
  const workspaces = useWorkspaces();
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
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
            startTransition(() => {
              setCurrentWorkspaceId(targetWorkspaceId);
              setCurrentPageId(targetPageId);
            });
            router.replace(`/workspace/${targetWorkspaceId}/${targetPageId}`);
          }
        }
      }
      return;
    }
    if (!currentWorkspace) {
      const targetWorkspace = workspaces.find(
        workspace => workspace.id === router.query.workspaceId
      );
      if (targetWorkspace) {
        startTransition(() => {
          setCurrentWorkspaceId(targetWorkspace.id);
        });
        router.replace({
          query: {
            ...router.query,
            workspaceId: targetWorkspace.id,
          },
        });
        return;
      } else {
        const first = workspaces.at(0);
        if (first) {
          startTransition(() => {
            setCurrentWorkspaceId(first.id);
          });
          router.replace({
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
            startTransition(() => {
              setCurrentPageId(targetId);
            });
            router.replace({
              query: {
                ...router.query,
                pageId: targetId,
              },
            });
            return;
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
  ]);
}
