import { assertExists } from '@blocksuite/store';
import { useEffect, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspacePageTitle(
  blockSuiteWorkspace: BlockSuiteWorkspace,
  pageId: string
) {
  const page = blockSuiteWorkspace.getPage(pageId);
  const [title, setTitle] = useState(() => page?.meta.title || 'AFFiNE');
  useEffect(() => {
    const page = blockSuiteWorkspace.getPage(pageId);
    setTitle(page?.meta.title || 'AFFiNE');
    const dispose = blockSuiteWorkspace.meta.pagesUpdated.on(() => {
      const page = blockSuiteWorkspace.getPage(pageId);
      assertExists(page);
      setTitle(page?.meta.title || 'AFFiNE');
    });
    return () => {
      dispose.dispose();
    };
  }, [blockSuiteWorkspace, pageId]);

  return title;
}
