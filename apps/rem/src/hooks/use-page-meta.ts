import { PageMeta } from '@blocksuite/store';
import { useEffect, useMemo, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

declare module '@blocksuite/store' {
  interface PageMeta {
    mode: 'page' | 'edgeless';
  }
}

export function usePageMeta(
  blockSuiteWorkspace: BlockSuiteWorkspace
): PageMeta[] {
  const [pageMeta, setPageMeta] = useState(
    () => blockSuiteWorkspace.meta.pageMetas
  );
  const [prev, setPrev] = useState(() => blockSuiteWorkspace);
  if (prev !== blockSuiteWorkspace) {
    setPrev(blockSuiteWorkspace);
    setPageMeta(blockSuiteWorkspace.meta.pageMetas);
  }
  useEffect(() => {
    const dispose = blockSuiteWorkspace.meta.pagesUpdated.on(() => {
      setPageMeta(blockSuiteWorkspace.meta.pageMetas);
    });
    return () => {
      dispose.dispose();
    };
  }, [blockSuiteWorkspace]);
  return pageMeta;
}

export function usePageMetaMutation(blockSuiteWorkspace: BlockSuiteWorkspace) {
  return useMemo(
    () => ({
      setPageMeta: (pageId: string, pageMeta: Partial<PageMeta>) => {
        blockSuiteWorkspace.meta.setPageMeta(pageId, pageMeta);
      },
    }),
    [blockSuiteWorkspace]
  );
}
