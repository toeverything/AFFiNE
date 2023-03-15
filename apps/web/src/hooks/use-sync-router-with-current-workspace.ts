import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

import { useCurrentWorkspace } from './current/use-current-workspace';
import { useWorkspaces } from './use-workspaces';

export function useSyncRouterWithCurrentWorkspace(router: NextRouter) {
  const [currentWorkspace, setCurrentWorkspaceId] = useCurrentWorkspace();
  const workspaces = useWorkspaces();
  useEffect(() => {
    const listener: Parameters<typeof router.events.on>[1] = (url: string) => {
      if (url.startsWith('/')) {
        const path = url.split('/');
        if (path.length === 4 && path[1] === 'workspace') {
          setCurrentWorkspaceId(path[2]);
        }
      }
    };

    router.events.on('routeChangeStart', listener);
    return () => {
      router.events.off('routeChangeStart', listener);
    };
  }, [currentWorkspace, router, setCurrentWorkspaceId]);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const workspaceId = router.query.workspaceId;
    if (typeof workspaceId !== 'string') {
      return;
    }
    if (!currentWorkspace) {
      const targetWorkspace = workspaces.find(
        workspace => workspace.id === workspaceId
      );
      if (targetWorkspace) {
        setCurrentWorkspaceId(targetWorkspace.id);
      } else {
        const targetWorkspace = workspaces.at(0);
        if (targetWorkspace) {
          setCurrentWorkspaceId(targetWorkspace.id);
          router.push({
            pathname: '/workspace/[workspaceId]/all',
            query: {
              workspaceId: targetWorkspace.id,
            },
          });
        }
      }
    }
  }, [currentWorkspace, router, setCurrentWorkspaceId, workspaces]);
}
