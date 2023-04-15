import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import type { WorkspaceFlavour } from '@affine/workspace/type';
import type { WorkspaceRegistry } from '@affine/workspace/type';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { WorkspacePlugins } from '../plugins';
import { useRouterHelper } from './use-router-helper';

/**
 * Transform workspace from one flavour to another
 *
 * The logic here is to delete the old workspace and create a new one.
 */
export function useTransformWorkspace() {
  const set = useSetAtom(jotaiWorkspacesAtom);
  const router = useRouter();
  const helper = useRouterHelper(router);
  return useCallback(
    async <From extends WorkspaceFlavour, To extends WorkspaceFlavour>(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ): Promise<string> => {
      await WorkspacePlugins[from].CRUD.delete(workspace as any);
      const newId = await WorkspacePlugins[to].CRUD.create(
        workspace.blockSuiteWorkspace
      );
      set(workspaces => {
        const idx = workspaces.findIndex(ws => ws.id === workspace.id);
        workspaces.splice(idx, 1, {
          id: newId,
          flavour: to,
        });
        return [...workspaces];
      });
      await helper.jumpToWorkspace(newId);
      return newId;
    },
    [helper, set]
  );
}
