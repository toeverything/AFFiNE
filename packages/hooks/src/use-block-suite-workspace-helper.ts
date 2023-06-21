import type { Page, Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useMemo } from 'react';

export function useBlockSuiteWorkspaceHelper(blockSuiteWorkspace: Workspace) {
  return useMemo(
    () => ({
      createPage: (pageId?: string): Page => {
        assertExists(blockSuiteWorkspace);
        return blockSuiteWorkspace.createPage({ id: pageId });
      },
    }),
    [blockSuiteWorkspace]
  );
}
