import { useMemo } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspaceHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  return useMemo(
    () => ({
      createPage: (pageId: string) => {
        blockSuiteWorkspace.createPage(pageId);
      },
    }),
    [blockSuiteWorkspace]
  );
}
