import type { Page, Workspace } from '@blocksuite/store';
import { useMemo } from 'react';
import { v4 as uuid } from 'uuid';

export function useBlockSuiteWorkspaceHelper(blockSuiteWorkspace: Workspace) {
  return useMemo(
    () => ({
      createPage: (pageId?: string): Page => {
        if (!pageId) {
          pageId = uuid();
        }
        return blockSuiteWorkspace.createPage({ id: pageId });
      },
    }),
    [blockSuiteWorkspace]
  );
}
