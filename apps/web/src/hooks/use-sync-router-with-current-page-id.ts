import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { useAtom } from 'jotai';
import type { NextRouter } from 'next/router';

export function useSyncRouterWithCurrentPageId(router: NextRouter) {
  const [currentPageId, setCurrentPageId] = useAtom(rootCurrentPageIdAtom);
  if (!router.isReady) {
    return;
  }
  const pageId = router.query.pageId;
  if (currentPageId === pageId) {
    return;
  }
  if (typeof pageId === 'string') {
    console.log('set page id', pageId);
    setCurrentPageId(pageId);
  } else if (pageId === undefined) {
    console.log('cleanup page');
    setCurrentPageId(null);
  }
}
