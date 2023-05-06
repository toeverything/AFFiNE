import { DebugLogger } from '@affine/debug';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { useAtom, useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import type { NextRouter } from 'next/router';
import { useEffect, useMemo, useRef } from 'react';

const logger = new DebugLogger('useSyncRouterWithCurrentWorkspaceId');

export function useSyncRouterWithCurrentWorkspaceId(router: NextRouter) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );

  const routerRef = useRef(router);

  const targetWorkspaceIdAtom = useMemo(
    () =>
      selectAtom(rootWorkspacesMetadataAtom, metadata => {
        const workspaceId = router.query.workspaceId;
        if (typeof workspaceId !== 'string') {
          return null;
        }
        const target = metadata.find(workspace => workspace.id === workspaceId);
        return target?.id || currentWorkspaceId || metadata[0].id;
      }),
    [currentWorkspaceId, router.query.workspaceId]
  );

  const targetWorkspaceId = useAtomValue(targetWorkspaceIdAtom);
  routerRef.current = router;

  useEffect(() => {
    const router = routerRef.current;
    if (!router.isReady) {
      return;
    }

    if (targetWorkspaceId !== currentWorkspaceId) {
      logger.debug('redirect to', targetWorkspaceId);
      setCurrentWorkspaceId(targetWorkspaceId);
      void router.push({
        pathname: router.pathname,
        query: {
          ...router.query,
          workspaceId: targetWorkspaceId,
        },
      });
    }
  }, [targetWorkspaceId, setCurrentWorkspaceId, currentWorkspaceId]);
}
