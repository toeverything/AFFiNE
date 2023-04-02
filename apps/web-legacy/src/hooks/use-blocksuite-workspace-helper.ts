import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspaceHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace | null
) {
  return useMemo(
    () => ({
      createPage: (pageId: string, parentId?: string): Page => {
        assertExists(blockSuiteWorkspace);
        return blockSuiteWorkspace.createPage(pageId, parentId);
      },
    }),
    [blockSuiteWorkspace]
  );
}
