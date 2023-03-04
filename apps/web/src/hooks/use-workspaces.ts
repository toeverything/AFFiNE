import { nanoid } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { jotaiWorkspacesAtom, workspacesAtom } from '../atoms';
import { LocalPlugin } from '../plugins/local';
import { LocalWorkspace, RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { createEmptyBlockSuiteWorkspace } from '../utils';

export function useWorkspaces(): RemWorkspace[] {
  return useAtomValue(workspacesAtom);
}

export function useWorkspacesHelper() {
  const workspaces = useWorkspaces();
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
    deleteWorkspace: useCallback(() => {}, []),
  };
}
