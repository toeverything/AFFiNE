import { DebugLogger } from '@affine/debug';
import { jotaiStore, jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { workspaceByIdAtomFamily, workspacesAtom } from '../atoms';
import { WorkspacePlugins } from '../plugins';
import { LocalPlugin } from '../plugins/local';

export function useWorkspaces() {
  const atoms = useAtomValue(workspacesAtom);
  return atoms;
}

const logger = new DebugLogger('use-workspaces');

export function useWorkspacesHelper() {
  const workspaces = useWorkspaces();
  const jotaiWorkspaces = useAtomValue(jotaiWorkspacesAtom);
  const set = useSetAtom(jotaiWorkspacesAtom);
  return {
    createWorkspacePage: useCallback(
      async (workspaceId: string, pageId: string) => {
        const workspace = await jotaiStore.get(
          workspaceByIdAtomFamily(workspaceId)
        );
        if (workspace && 'blockSuiteWorkspace' in workspace) {
          workspace.blockSuiteWorkspace.createPage(pageId);
        } else {
          throw new Error('cannot create page. blockSuiteWorkspace not found');
        }
      },
      []
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
            flavour: WorkspaceFlavour.LOCAL,
          },
        ]);
        logger.debug('created local workspace', id);
        return id;
      },
      [set]
    ),
    deleteWorkspace: useCallback(
      async (workspaceId: string) => {
        const targetJotaiWorkspace = jotaiWorkspaces.find(
          ws => ws.id === workspaceId
        );
        const targetWorkspace = await jotaiStore.get(
          workspaceByIdAtomFamily(workspaceId)
        );
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
      [jotaiWorkspaces, set]
    ),
  };
}

export const useElementResizeEffect = (
  element: Element | null,
  fn: () => void | (() => () => void),
  // TODO: add throttle
  throttle = 0
) => {
  useEffect(() => {
    if (!element) {
      return;
    }
    let dispose: void | (() => void);
    const resizeObserver = new ResizeObserver(entries => {
      dispose = fn();
    });
    resizeObserver.observe(element);
    return () => {
      dispose?.();
      resizeObserver.disconnect();
    };
  }, [element, fn]);
};
