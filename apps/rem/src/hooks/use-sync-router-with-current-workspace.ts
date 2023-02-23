import { NextRouter } from 'next/router';
import { useEffect } from 'react';

import { RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { useCurrentPage } from './current/use-current-page';
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
  const [currentPage, setCurrentPageId] = useCurrentPage();
  const workspaces = useWorkspaces();
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const targetPageId = router.query.pageId;
    const workspaceId = router.query.workspaceId;
    if (typeof targetPageId !== 'string' || typeof workspaceId !== 'string') {
      if (router.asPath === '/') {
        const first = workspaces.at(0);
        if (first && 'blockSuiteWorkspace' in first) {
          const targetWorkspaceId = first.id;
          const targetPageId =
            first.blockSuiteWorkspace.meta.pageMetas.at(0)?.id;
          if (targetPageId) {
            setCurrentPageId(targetPageId);
            setCurrentWorkspaceId(targetWorkspaceId);
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
        setCurrentWorkspaceId(targetWorkspace.id);
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
          setCurrentWorkspaceId(first.id);
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
      if (!currentPage && currentWorkspace) {
        const targetId = findSuitablePageId(currentWorkspace, targetPageId);
        if (targetId) {
          setCurrentPageId(targetId);
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
  }, [
    currentPage,
    currentWorkspace,
    router,
    router.query.workspaceId,
    setCurrentPageId,
    setCurrentWorkspaceId,
    workspaces,
  ]);
}
