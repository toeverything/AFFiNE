import type { Page, Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import {
  getMilestones,
  markMilestone,
  revertUpdate,
} from '@toeverything/y-indexeddb';
import { useMemo } from 'react';

export function useBlockSuiteWorkspaceHelper(blockSuiteWorkspace: Workspace) {
  return useMemo(
    () => ({
      createPage: (pageId: string): Page => {
        assertExists(blockSuiteWorkspace);
        return blockSuiteWorkspace.createPage({ id: pageId });
      },
      markMilestone: async (name: string) => {
        assertExists(blockSuiteWorkspace);
        const doc = blockSuiteWorkspace.doc;
        await markMilestone(blockSuiteWorkspace.id, doc, name);
      },
      revertMilestone: async (name: string) => {
        assertExists(blockSuiteWorkspace);
        const doc = blockSuiteWorkspace.doc;
        const list = await getMilestones(blockSuiteWorkspace.id);
        if (!list) {
          throw new Error('no milestone');
        }
        const milestone = list[name];
        if (milestone) {
          revertUpdate(doc, milestone, () => 'Map');
        }
      },
      listMilestone: async () => {
        assertExists(blockSuiteWorkspace);
        return await getMilestones(blockSuiteWorkspace.id);
      },
    }),
    [blockSuiteWorkspace]
  );
}
