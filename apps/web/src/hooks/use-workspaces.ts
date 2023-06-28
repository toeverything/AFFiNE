import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { saveWorkspaceToLocalStorage } from '@affine/workspace/local/crud';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { LocalAdapter } from '../adapters/local';
import { WorkspaceAdapters } from '../adapters/workspace';
import { workspacesAtom } from '../atoms';
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
    addLocalWorkspace: useCallback(
      async (workspaceId: string): Promise<string> => {
        saveWorkspaceToLocalStorage(workspaceId);
        set(workspaces => [
          ...workspaces,
          {
            id: workspaceId,
            flavour: WorkspaceFlavour.LOCAL,
            version: WorkspaceVersion.SubDoc,
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
        const id = await LocalAdapter.CRUD.create(blockSuiteWorkspace);
        set(workspaces => [
          ...workspaces,
          {
            id,
            flavour: WorkspaceFlavour.LOCAL,
            version: WorkspaceVersion.SubDoc,
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
        await WorkspaceAdapters[targetWorkspace.flavour].CRUD.delete(
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
