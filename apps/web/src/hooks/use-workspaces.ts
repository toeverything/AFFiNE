import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { saveWorkspaceToLocalStorage } from '@affine/workspace/local/crud';
import {
  createEmptyBlockSuiteWorkspace,
  getWorkspace,
} from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { LocalAdapter } from '../adapters/local';
import { WorkspaceAdapters } from '../adapters/workspace';

const logger = new DebugLogger('use-workspaces');

/**
 * This hook has the permission to all workspaces. Be careful when using it.
 */
export function useAppHelper() {
  const jotaiWorkspaces = useAtomValue(rootWorkspacesMetadataAtom);
  const set = useSetAtom(rootWorkspacesMetadataAtom);
  return {
    addLocalWorkspace: useCallback(
      async (workspaceId: string): Promise<string> => {
        createEmptyBlockSuiteWorkspace(workspaceId, WorkspaceFlavour.LOCAL);
        saveWorkspaceToLocalStorage(workspaceId);
        await set(workspaces => [
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
        await set(workspaces => [
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
        if (!targetJotaiWorkspace) {
          throw new Error('page cannot be found');
        }

        const targetWorkspace = getWorkspace(targetJotaiWorkspace.id);

        // delete workspace from plugin
        await WorkspaceAdapters[targetJotaiWorkspace.flavour].CRUD.delete(
          targetWorkspace
        );
        // delete workspace from jotai storage
        await set(workspaces => workspaces.filter(ws => ws.id !== workspaceId));
      },
      [jotaiWorkspaces, set]
    ),
  };
}
