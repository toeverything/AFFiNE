import { useEffect } from 'react';

import { subscribeMarkdownFileRouteRequests } from '../services/markdown-file-sync';

type RouteBridgeRouter = {
  navigate: (path: string) => Promise<unknown> | unknown;
};

export function MarkdownFileSyncRouteBridge({
  router,
}: {
  router: RouteBridgeRouter;
}) {
  useEffect(() => {
    return subscribeMarkdownFileRouteRequests(({ workspaceId, docId }) => {
      Promise.resolve(
        router.navigate(`/workspace/${workspaceId}/${docId}`)
      ).catch((error: unknown) => {
        console.error('Failed to navigate to Markdown file binding', error);
      });
    });
  }, [router]);

  return null;
}
