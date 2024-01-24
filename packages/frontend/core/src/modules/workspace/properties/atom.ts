import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

import { waitForCurrentWorkspaceAtom } from '../atoms';
import { WorkspacePropertiesAdapter } from './adapter';

// todo: remove the inner atom when workspace is closed by using workspaceAdapterAtomFamily.remove
export const workspaceAdapterAtomFamily = atomFamily(
  (workspace: BlockSuiteWorkspace) => {
    return atom(async () => {
      await workspace.doc.whenLoaded;
      return new WorkspacePropertiesAdapter(workspace);
    });
  }
);

export const currentWorkspacePropertiesAdapterAtom = atom(async get => {
  const workspace = await get(waitForCurrentWorkspaceAtom);
  return get(workspaceAdapterAtomFamily(workspace.blockSuiteWorkspace));
});
