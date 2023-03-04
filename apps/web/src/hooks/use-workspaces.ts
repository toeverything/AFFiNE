import { nanoid } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { jotaiWorkspacesAtom, workspacesAtom } from '../atoms';
import { WorkspacePlugins } from '../plugins';
import { LocalPlugin } from '../plugins/local';
import { LocalWorkspace, RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { createEmptyBlockSuiteWorkspace } from '../utils';

export function useWorkspaces(): RemWorkspace[] {
  return useAtomValue(workspacesAtom);
}

export function useWorkspacesHelper() {
  const workspaces = useWorkspaces();
  const jotaiWorkspaces = useAtomValue(jotaiWorkspacesAtom);
  const set = useSetAtom(jotaiWorkspacesAtom);
  return {
    createWorkspacePage: useCallback(
      (workspaceId: string, pageId: string) => {
        const workspace = workspaces.find(
          ws => ws.id === workspaceId
        ) as LocalWorkspace;
        if (workspace && 'blockSuiteWorkspace' in workspace) {
          workspace.blockSuiteWorkspace.createPage(pageId);
        } else {
          throw new Error('cannot create page. blockSuiteWorkspace not found');
        }
      },
      [workspaces]
    ),
    createLocalWorkspace: useCallback(
      async (name: string): Promise<string> => {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          _ => undefined
        );
        blockSuiteWorkspace.meta.setName(name);
        const id = await LocalPlugin.CRUD.create(blockSuiteWorkspace);
        set(workspaces => [
          ...workspaces,
          {
            id,
            flavour: RemWorkspaceFlavour.LOCAL,
          },
        ]);
        return id;
      },
      [set]
    ),
    deleteWorkspace: useCallback(
      async (workspaceId: string) => {
        const targetJotaiWorkspace = jotaiWorkspaces.find(
          ws => ws.id === workspaceId
        );
        const targetWorkspace = workspaces.find(ws => ws.id === workspaceId);
        if (!targetJotaiWorkspace || !targetWorkspace) {
          throw new Error('page cannot be found');
        }

        // delete workspace from plugin
        await WorkspacePlugins[targetWorkspace.flavour].CRUD.delete(
          // fixme: type casting
          targetWorkspace as any
        );
        // delete workspace from jotai storage
        set(workspaces => workspaces.filter(ws => ws.id !== workspaceId));
      },
      [jotaiWorkspaces, set, workspaces]
    ),
  };
}
