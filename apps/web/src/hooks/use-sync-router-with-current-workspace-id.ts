import { DebugLogger } from '@affine/debug';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { useAtom, useAtomValue } from 'jotai';
import type { NextRouter } from 'next/router';

const logger = new DebugLogger('useSyncRouterWithCurrentWorkspaceId');

export function useSyncRouterWithCurrentWorkspaceId(router: NextRouter) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  if (!router.isReady) {
    return;
  }
  const workspaceId = router.query.workspaceId;
  if (typeof workspaceId !== 'string') {
    return;
  }
  if (currentWorkspaceId === workspaceId) {
    return;
  }
  if (currentWorkspaceId) {
    if (currentWorkspaceId !== workspaceId) {
      const target = metadata.find(workspace => workspace.id === workspaceId);
      logger.debug('workspace not exist, redirect to current one');
      if (!target) {
        // workspaceId is invalid, redirect to currentWorkspaceId
        void router.push({
          pathname: router.pathname,
          query: {
            ...router.query,
            workspaceId: currentWorkspaceId,
          },
        });
      }
    }
    return;
  }
  const targetWorkspace = metadata.find(
    workspace => workspace.id === workspaceId
  );
  if (targetWorkspace) {
    console.log('set workspace id', workspaceId);
    setCurrentWorkspaceId(targetWorkspace.id);
    logger.debug('redirect to', targetWorkspace.id);
    void router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        workspaceId: targetWorkspace.id,
      },
    });
  } else {
    const targetWorkspace = metadata.at(0);
    if (targetWorkspace) {
      console.log('set workspace id', workspaceId);
      setCurrentWorkspaceId(targetWorkspace.id);
      logger.debug('redirect to', targetWorkspace.id);
      void router.push({
        pathname: router.pathname,
        query: {
          ...router.query,
          workspaceId: targetWorkspace.id,
        },
      });
    }
  }
}
