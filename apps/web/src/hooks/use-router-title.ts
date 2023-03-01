import { NextRouter } from 'next/router';
import { useMemo } from 'react';

import { WorkspaceSubPathName } from '../shared';

export function useRouterTitle(router: NextRouter) {
  return useMemo(() => {
    if (!router.isReady) {
      return 'Loading...';
    } else {
      if (
        !router.query.pageId &&
        router.pathname.startsWith('/workspace/[workspaceId]/')
      ) {
        const subPath = router.pathname.split('/').at(-1);
        if (subPath && subPath in WorkspaceSubPathName) {
          return (
            WorkspaceSubPathName[subPath as keyof typeof WorkspaceSubPathName] +
            ' - AFFiNE'
          );
        }
      }
      return 'AFFiNE';
    }
  }, [router]);
}
