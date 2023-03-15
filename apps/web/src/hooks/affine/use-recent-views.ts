import { useAtomValue, useSetAtom } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

import {
  workspaceRecentViewsAtom,
  workspaceRecentViresWriteAtom,
} from '../../atoms';
import { useCurrentWorkspace } from '../current/use-current-workspace';
import { usePageMeta } from '../use-page-meta';

export function useRecentlyViewed() {
  const [workspace] = useCurrentWorkspace();
  const workspaceId = workspace?.id || null;
  const recentlyViewed = useAtomValue(workspaceRecentViewsAtom);

  if (!workspaceId) return [];
  return recentlyViewed[workspaceId] ?? [];
}

export function useSyncRecentViewsWithRouter(router: NextRouter) {
  const [workspace] = useCurrentWorkspace();
  const workspaceId = workspace?.id || null;
  const blockSuiteWorkspace = workspace?.blockSuiteWorkspace || null;
  const pageId = router.query.pageId;
  const set = useSetAtom(workspaceRecentViresWriteAtom);
  const meta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  useEffect(() => {
    if (!workspaceId) return;
    if (pageId && meta) {
      set(workspaceId, {
        id: pageId as string,
        mode: meta.mode || 'page',
      });
    }
  }, [pageId, meta, workspaceId, set]);
}
