import type { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceRegistry } from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { WorkspaceAdapters } from '../adapters/workspace';

/**
 * Transform workspace from one flavour to another
 *
 * The logic here is to delete the old workspace and create a new one.
 */
export function useTransformWorkspace() {
  const set = useSetAtom(rootWorkspacesMetadataAtom);
  return useCallback(
    async <From extends WorkspaceFlavour, To extends WorkspaceFlavour>(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ): Promise<string> => {
      // create first, then delete, in case of failure
      const newId = await WorkspaceAdapters[to].CRUD.create(
        workspace.blockSuiteWorkspace
      );
      await WorkspaceAdapters[from].CRUD.delete(workspace as any);
      set(workspaces => {
        const idx = workspaces.findIndex(ws => ws.id === workspace.id);
        workspaces.splice(idx, 1, {
          id: newId,
          flavour: to,
        });
        return [...workspaces];
      });
      return newId;
    },
    [set]
  );
}
