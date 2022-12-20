import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { PageMeta } from '@blocksuite/store';

export const useCurrentPageMeta = () => {
  const { currentPage, currentWorkspace } = useAppState();

  const pageMetaHandler = useCallback(() => {
    if (!currentPage || !currentWorkspace) {
      return null;
    }
    return (
      currentWorkspace?.meta.pageMetas.find(p => p.id === currentPage.pageId) ??
      null
    );
  }, [currentPage, currentWorkspace]);

  const [currentPageMeta, setCurrentPageMeta] = useState<PageMeta | null>(
    pageMetaHandler
  );

  useEffect(() => {
    setCurrentPageMeta(pageMetaHandler);

    const dispose = currentWorkspace?.meta.pagesUpdated.on(res => {
      setCurrentPageMeta(pageMetaHandler);
    }).dispose;

    return () => {
      dispose?.();
    };
  }, [currentPage, currentWorkspace, pageMetaHandler]);

  return currentPageMeta;
};

export default useCurrentPageMeta;
