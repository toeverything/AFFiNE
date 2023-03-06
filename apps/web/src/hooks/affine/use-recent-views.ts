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
  const id = router.query.pageId as string;
  const meta = usePageMeta(blocksuiteWorkspace).find(meta => meta.id === id);
  const [recentlyViewed, setRecentlyViewed] = useAtom(workspaceRecentViewsAtom);

  useEffect(() => {
    router.events.on('routeChangeComplete', () => {
      if (router.query.pageId) {
        const workspaceRecentlyViewed =
          recentlyViewed[workspaceId] || ([] as WorkspaceRecentViews[string]);

        const newRecentlyViewed = [
          { title: meta?.title || '', id: id },
          ...workspaceRecentlyViewed.filter(item => item.id !== id).slice(0, 2),
        ];

        setRecentlyViewed({
          ...recentlyViewed,
          [workspaceId]: newRecentlyViewed,
        });
      }
    });
    return () => {
      router.events.off('routeChangeComplete', () => {});
    };
  }, [router, setRecentlyViewed, recentlyViewed, workspaceId, meta?.title, id]);

  return recentlyViewed[workspaceId] || [];
}
