import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { useSetAtom } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

export const REDIRECT_TIMEOUT = 1000;
export function useSyncRouterWithCurrentPageId(router: NextRouter) {
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const pageId = router.query.pageId;
    if (typeof pageId === 'string') {
      setCurrentPageId(pageId);
    }
  }, [router.isReady, router.query.pageId, setCurrentPageId]);
}
