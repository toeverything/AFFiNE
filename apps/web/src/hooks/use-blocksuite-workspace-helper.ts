import { assertExists } from '@blocksuite/store';
import { useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspaceHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace | null
) {
  return useMemo(
    () => ({
      createPage: (pageId: string, title?: string): Promise<string> => {
        return new Promise(resolve => {
          assertExists(blockSuiteWorkspace);
          const dispose = blockSuiteWorkspace.slots.pageAdded.on(id => {
            if (id === pageId) {
              dispose.dispose();
              // Fixme: https://github.com/toeverything/blocksuite/issues/1350
              setTimeout(() => {
                resolve(pageId);
              }, 0);
            }
          });
          blockSuiteWorkspace.createPage(pageId);
        });
      },
    }),
    [blockSuiteWorkspace]
  );
}
