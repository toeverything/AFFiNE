import { DebugLogger } from '@affine/debug';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { saveWorkspaceToLocalStorage } from '@affine/workspace/local/crud';
import type { LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { workspacesAtom } from '../atoms';
import { WorkspacePlugins } from '../plugins';
import { LocalPlugin } from '../plugins/local';
import type { AllWorkspace } from '../shared';

export function useWorkspaces(): AllWorkspace[] {
  return useAtomValue(workspacesAtom);
}

const logger = new DebugLogger('use-workspaces');

/**
 * This hook has the permission to all workspaces. Be careful when using it.
 */
export function useAppHelper() {
  const workspaces = useWorkspaces();
  const jotaiWorkspaces = useAtomValue(rootWorkspacesMetadataAtom);
  const set = useSetAtom(rootWorkspacesMetadataAtom);
  return {
    createWorkspacePage: useCallback(
      (workspaceId: string, pageId: string) => {
        const workspace = workspaces.find(
          ws => ws.id === workspaceId
        ) as LocalWorkspace;
        if (workspace && 'blockSuiteWorkspace' in workspace) {
          workspace.blockSuiteWorkspace.createPage({ id: pageId });
        } else {
          throw new Error('cannot create page. blockSuiteWorkspace not found');
        }
      },
      [workspaces]
    ),
    addLocalWorkspace: useCallback(
      async (workspaceId: string): Promise<string> => {
        saveWorkspaceToLocalStorage(workspaceId);
        set(workspaces => [
          ...workspaces,
          {
            id: workspaceId,
            flavour: WorkspaceFlavour.LOCAL,
          },
        ]);
        logger.debug('imported local workspace', workspaceId);
        return workspaceId;
      },
      [set]
    ),
    createLocalWorkspace: useCallback(
      async (name: string): Promise<string> => {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          WorkspaceFlavour.LOCAL
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

export const useElementResizeEffect = (
  element: Element | null,
  fn: () => void | (() => () => void),
  // TODO: add throttle
  _throttle = 0
) => {
  useEffect(() => {
    if (!element) {
      return;
    }
    let dispose: void | (() => void);
    const resizeObserver = new ResizeObserver(() => {
      dispose = fn();
    });
    resizeObserver.observe(element);
    return () => {
      dispose?.();
      resizeObserver.disconnect();
    };
  }, [element, fn]);
};
