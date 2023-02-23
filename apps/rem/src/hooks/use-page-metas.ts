import { PageMeta } from '@blocksuite/store';
import { useEffect, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

declare module '@blocksuite/store' {
  interface PageMeta {
    mode: 'page' | 'edgeless';
  }
}

export function usePageMetas(
  blockSuiteWorkspace: BlockSuiteWorkspace
): PageMeta[] {
  const [pageMetas, setPageMetas] = useState(
    () => blockSuiteWorkspace.meta.pageMetas
  );
  const [prev, setPrev] = useState(() => blockSuiteWorkspace);
  if (prev !== blockSuiteWorkspace) {
    setPrev(blockSuiteWorkspace);
    setPageMetas(blockSuiteWorkspace.meta.pageMetas);
  }
  useEffect(() => {
    const dispose = blockSuiteWorkspace.meta.pagesUpdated.on(() => {
      setPageMetas(blockSuiteWorkspace.meta.pageMetas);
    });
    return () => {
      dispose.dispose();
    };
  }, [blockSuiteWorkspace]);
  return pageMetas;
}
