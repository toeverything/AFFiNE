import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { useAtom, useAtomValue } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

export function useSyncRouterWithCurrentWorkspaceId(router: NextRouter) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const workspaceId = router.query.workspaceId;
    if (typeof workspaceId !== 'string') {
      return;
    }
    if (currentWorkspaceId) {
      return;
    }
    const targetWorkspace = metadata.find(
      workspace => workspace.id === workspaceId
    );
    if (targetWorkspace) {
      console.log('set workspace id', workspaceId);
      setCurrentWorkspaceId(targetWorkspace.id);
      if (environment.isDesktop) {
        window.apis?.onWorkspaceChange(targetWorkspace.id);
      }
      void router.push({
        pathname: '/workspace/[workspaceId]/all',
        query: {
          workspaceId: targetWorkspace.id,
        },
      });
    } else {
      const targetWorkspace = metadata.at(0);
      if (targetWorkspace) {
        console.log('set workspace id', workspaceId);
        setCurrentWorkspaceId(targetWorkspace.id);
        void router.push({
          pathname: '/workspace/[workspaceId]/all',
          query: {
            workspaceId: targetWorkspace.id,
          },
        });
      }
    }
  }, [currentWorkspaceId, metadata, router, setCurrentWorkspaceId]);
}
