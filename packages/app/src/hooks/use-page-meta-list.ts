import { useEffect, useState } from 'react';
import { PageMeta } from '@/providers/app-state-provider/usePageList';
import { useAppState } from '@/providers/app-state-provider';

export const usePageMetaList = () => {
  const { currentWorkspace } = useAppState();
  const [pageList, setPageList] = useState<PageMeta[]>([]);

  useEffect(() => {
    if (!currentWorkspace) {
      return;
    }
    setPageList(currentWorkspace.meta.pageMetas as PageMeta[]);
    const dispose = currentWorkspace.meta.pagesUpdated.on(res => {
      setPageList(currentWorkspace.meta.pageMetas as PageMeta[]);
    }).dispose;
    return () => {
      dispose();
    };
  }, [currentWorkspace]);

  return pageList;
};

export default usePageMetaList;
