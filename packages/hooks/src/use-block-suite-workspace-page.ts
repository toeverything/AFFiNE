import type { Page, Workspace } from '@blocksuite/store';
import { useEffect, useState } from 'react';

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Page | null {
  const [page, setPage] = useState(() => {
    if (pageId === null) {
      return null;
    }
    return blockSuiteWorkspace.getPage(pageId);
  });
  useEffect(() => {
    if (pageId) {
      setPage(blockSuiteWorkspace.getPage(pageId));
    }
  }, [blockSuiteWorkspace, pageId]);
  useEffect(() => {
    const disposable = blockSuiteWorkspace.slots.pageAdded.on(id => {
      if (pageId === id) {
        setPage(blockSuiteWorkspace.getPage(id));
      }
    });
    return () => {
      disposable.dispose();
    };
  }, [blockSuiteWorkspace, pageId]);
  return page;
}
