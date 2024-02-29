import type { Doc, Workspace } from '@blocksuite/store';
import { useMemo } from 'react';

export function useBlockSuiteWorkspaceHelper(blockSuiteWorkspace: Workspace) {
  return useMemo(
    () => ({
      createDoc: (pageId?: string): Doc => {
        return blockSuiteWorkspace.createDoc({ id: pageId });
      },
    }),
    [blockSuiteWorkspace]
  );
}
