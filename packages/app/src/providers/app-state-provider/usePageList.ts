import { useState, useEffect } from 'react';
import type { Workspace } from '@blocksuite/store';
import { PageMeta } from './interface';

export const usePageList = (workspace: Workspace | null) => {
  const [pageList, setPageList] = useState<PageMeta[]>([]);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    setPageList(workspace.meta.pageMetas as PageMeta[]);
    const dispose = workspace.meta.pagesUpdated.on(res => {
      setPageList(workspace.meta.pageMetas as PageMeta[]);
    }).dispose;
    return () => {
      dispose();
    };
  }, [workspace]);

  return pageList;
};
