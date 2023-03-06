import { useAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';

import { WorkspaceRecentViews, workspaceRecentViewsAtom } from '../../atoms';
import { useCurrentWorkspace } from '../current/use-current-workspace';
import { usePageMeta } from '../use-page-meta';

export function useRecentlyViewed() {
  const router = useRouter();
  const [workspace] = useCurrentWorkspace();
  const workspaceId = workspace?.id || '';
  const blocksuiteWorkspace = workspace?.blockSuiteWorkspace || null;
  const pageId = router.query.pageId;
  const meta = usePageMeta(blocksuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const [recentlyViewed, setRecentlyViewed] = useAtom(workspaceRecentViewsAtom);
  const prevMeta = useRef(meta);

  useEffect(() => {
    if (pageId && meta && prevMeta.current !== meta) {
      const workspaceRecentlyViewed =
        recentlyViewed[workspaceId] || ([] as WorkspaceRecentViews[string]);

      const newRecentlyViewed = [
        {
          title: meta.title || 'Untitled',
          id: pageId as string,
          mode: meta.mode || 'page',
        },
        ...workspaceRecentlyViewed
          .filter(item => item.id !== pageId)
          .slice(0, 2),
      ];
      console.log('newRecentlyViewed', newRecentlyViewed);

      setRecentlyViewed({
        ...recentlyViewed,
        [workspaceId]: newRecentlyViewed,
      });

      prevMeta.current = meta;
    }
  }, [pageId, meta, setRecentlyViewed, workspaceId, recentlyViewed]);

  return recentlyViewed[workspaceId] || [];
}
