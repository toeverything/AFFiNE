import { useCallback, useEffect, useState } from 'react';

import { PageMeta } from '@/providers/app-state-provider';
import { useGlobalState } from '@/store/app';

export const useCurrentPageMeta = (): PageMeta | null => {
  const currentPage = useGlobalState(store => store.currentPage);
  const currentBlockSuiteWorkspace = useGlobalState(
    store => store.currentWorkspace
  );

  const pageMetaHandler = useCallback((): PageMeta | null => {
    if (!currentPage || !currentBlockSuiteWorkspace) {
      return null;
    }
    return (
      (currentBlockSuiteWorkspace.meta.pageMetas.find(
        p => p.id === currentPage.id
      ) as PageMeta) ?? null
    );
  }, [currentPage, currentBlockSuiteWorkspace]);

  const [currentPageMeta, setCurrentPageMeta] = useState<PageMeta | null>(
    pageMetaHandler
  );

  useEffect(() => {
    setCurrentPageMeta(pageMetaHandler);

    const dispose = currentBlockSuiteWorkspace?.meta.pagesUpdated.on(() => {
      setCurrentPageMeta(pageMetaHandler);
    }).dispose;

    return () => {
      dispose?.();
    };
  }, [currentPage, currentBlockSuiteWorkspace, pageMetaHandler]);

  return currentPageMeta;
};

export default useCurrentPageMeta;
