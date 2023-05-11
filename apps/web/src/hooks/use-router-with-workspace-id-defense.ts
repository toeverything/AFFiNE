import { DebugLogger } from '@affine/debug';
import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { NextRouter } from 'next/router';
import { useMemo } from 'react';

const logger = new DebugLogger('useRouterWithWorkspaceIdDefense');

export function useRouterWithWorkspaceIdDefense(router: NextRouter) {
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  const exist = useMemo(
    () => metadata.find(m => m.id === currentWorkspaceId),
    [currentWorkspaceId, metadata]
  );
  if (!router.isReady) {
    return;
  }
  if (!currentWorkspaceId) {
    return;
  }
  if (!exist) {
    console.warn('workspace not exist, redirect to first one');
    // clean up
    setCurrentWorkspaceId(null);
    setCurrentPageId(null);
    const firstOne = metadata.at(0);
    if (!firstOne) {
      throw new Error('no workspace');
    }
    logger.debug('redirect to', firstOne.id);
    void router.push({
      pathname: '/workspace/[workspaceId]/all',
      query: {
        ...router.query,
        workspaceId: firstOne.id,
      },
    });
  }
}
