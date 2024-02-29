import { DisposableGroup } from '@blocksuite/global/utils';
import type { Doc, Workspace } from '@blocksuite/store';
import { useEffect, useState } from 'react';

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Doc | null {
  const [page, setPage] = useState(
    pageId ? blockSuiteWorkspace.getDoc(pageId) : null
  );

  useEffect(() => {
    const group = new DisposableGroup();
    group.add(
      blockSuiteWorkspace.slots.docAdded.on(id => {
        if (pageId === id) {
          setPage(blockSuiteWorkspace.getDoc(id));
        }
      })
    );
    group.add(
      blockSuiteWorkspace.slots.docRemoved.on(id => {
        if (pageId === id) {
          setPage(null);
        }
      })
    );
    return () => {
      group.dispose();
    };
  }, [blockSuiteWorkspace, pageId]);

  useEffect(() => {
    if (page && !page.loaded) {
      page.load();
    }
  }, [page]);

  return page;
}
