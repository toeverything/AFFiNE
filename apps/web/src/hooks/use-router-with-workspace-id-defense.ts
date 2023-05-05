import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

export function useRouterWithWorkspaceIdDefense(router: NextRouter) {
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(
    rootCurrentWorkspaceIdAtom
  );
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (!currentWorkspaceId) {
      return;
    }
    const exist = metadata.find(m => m.id === currentWorkspaceId);
    if (!exist) {
      console.warn('workspace not exist, redirect to first one');
      // clean up
      setCurrentWorkspaceId(null);
      setCurrentPageId(null);
      const firstOne = metadata.at(0);
      if (!firstOne) {
        throw new Error('no workspace');
      }
      void router.push({
        pathname: '/workspace/[workspaceId]/all',
        query: {
          ...router.query,
          workspaceId: firstOne.id,
        },
      });
    }
  }, [
    currentWorkspaceId,
    metadata,
    router,
    router.isReady,
    setCurrentPageId,
    setCurrentWorkspaceId,
  ]);
}
