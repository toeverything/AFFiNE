import { useAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

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

  useEffect(() => {
    const handleRouteChange = () => {
      if (pageId && meta) {
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

        setRecentlyViewed({
          ...recentlyViewed,
          [workspaceId]: newRecentlyViewed,
        });
      }
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [
    pageId,
    recentlyViewed,
    router.events,
    setRecentlyViewed,
    workspaceId,
    meta,
  ]);

  return recentlyViewed[workspaceId] || [];
}
