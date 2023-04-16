import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { useSetAtom } from 'jotai';
import type { NextRouter } from 'next/router';
import { useEffect } from 'react';

export function useSyncRouterWithCurrentPageId(router: NextRouter) {
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const pageId = router.query.pageId;
    if (typeof pageId === 'string') {
      console.log('set page id', pageId);
      setCurrentPageId(pageId);
    }
  }, [router.isReady, router.query.pageId, setCurrentPageId]);
}
