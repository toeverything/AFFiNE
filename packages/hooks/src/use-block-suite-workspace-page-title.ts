import type { Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useEffect, useState } from 'react';

export function useBlockSuiteWorkspacePageTitle(
  blockSuiteWorkspace: Workspace,
  pageId: string
) {
  const page = blockSuiteWorkspace.getPage(pageId);
  const [title, setTitle] = useState(() => page?.meta.title || 'AFFiNE');
  useEffect(() => {
    const page = blockSuiteWorkspace.getPage(pageId);
    setTitle(page?.meta.title || 'Untitled');
    const dispose = blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
      const page = blockSuiteWorkspace.getPage(pageId);
      assertExists(page);
      setTitle(page?.meta.title || 'Untitled');
    });
    return () => {
      dispose.dispose();
    };
  }, [blockSuiteWorkspace, pageId]);

  return title;
}
