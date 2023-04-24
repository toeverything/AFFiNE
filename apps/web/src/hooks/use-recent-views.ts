import type { Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue, useSetAtom } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

import {
  workspacePreferredModeAtom,
  workspaceRecentViewsAtom,
  workspaceRecentViresWriteAtom,
} from '../atoms';
import { useCurrentWorkspace } from './current/use-current-workspace';

export function useRecentlyViewed() {
  const [workspace] = useCurrentWorkspace();
  const workspaceId = workspace?.id || null;
  const recentlyViewed = useAtomValue(workspaceRecentViewsAtom);

  if (!workspaceId) return [];
  return recentlyViewed[workspaceId] ?? [];
}

export function useSyncRecentViewsWithRouter(
  router: NextRouter,
  blockSuiteWorkspace: Workspace
) {
  const workspaceId = blockSuiteWorkspace.id;
  const pageId = router.query.pageId;
  const set = useSetAtom(workspaceRecentViresWriteAtom);
  const meta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode = useAtomValue(workspacePreferredModeAtom)[
    pageId as string
  ];
  useEffect(() => {
    if (!workspaceId) return;
    if (pageId && meta) {
      set(workspaceId, {
        id: pageId as string,
        mode: currentMode ?? 'page',
      });
    }
  }, [pageId, meta, workspaceId, set, currentMode]);
}
