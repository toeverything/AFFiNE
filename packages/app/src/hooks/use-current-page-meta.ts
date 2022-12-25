import { useCallback, useEffect, useState } from 'react';
import { useAppState, PageMeta } from '@/providers/app-state-provider';

export const useCurrentPageMeta = (): PageMeta | null => {
  const { currentPage, currentWorkspace } = useAppState();

  const pageMetaHandler = useCallback((): PageMeta | null => {
    if (!currentPage || !currentWorkspace) {
      return null;
    }
    return (
      (currentWorkspace.meta.pageMetas.find(
        p => p.id === currentPage.id
      ) as PageMeta) ?? null
    );
  }, [currentPage, currentWorkspace]);

  const [currentPageMeta, setCurrentPageMeta] = useState<PageMeta | null>(
    pageMetaHandler
  );

  useEffect(() => {
    setCurrentPageMeta(pageMetaHandler);

    const dispose = currentWorkspace?.meta.pagesUpdated.on(() => {
      setCurrentPageMeta(pageMetaHandler);
    }).dispose;

    return () => {
      dispose?.();
    };
  }, [currentPage, currentWorkspace, pageMetaHandler]);

  return currentPageMeta;
};

export default useCurrentPageMeta;
