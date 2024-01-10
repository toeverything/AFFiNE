import { DebugLogger } from '@affine/debug';
import { DisposableGroup } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import { useEffect, useState } from 'react';

const logger = new DebugLogger('use-block-suite-workspace-page');

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Page | null {
  const [page, setPage] = useState(
    pageId ? blockSuiteWorkspace.getPage(pageId) : null
  );

  useEffect(() => {
    const group = new DisposableGroup();
    group.add(
      blockSuiteWorkspace.slots.pageAdded.on(id => {
        if (pageId === id) {
          setPage(blockSuiteWorkspace.getPage(id));
        }
      })
    );
    group.add(
      blockSuiteWorkspace.slots.pageRemoved.on(id => {
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
      page.load().catch(err => {
        logger.error('Failed to load page', err);
      });
    }
  }, [page]);

  return page;
}
