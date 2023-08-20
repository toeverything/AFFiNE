import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { saveWorkspaceToLocalStorage } from '@affine/workspace/local/crud';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { nanoid } from '@blocksuite/store';
import { getWorkspace } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { buildShowcaseWorkspace } from '@toeverything/infra/blocksuite';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { LocalAdapter } from '../adapters/local';
import { WorkspaceAdapters } from '../adapters/workspace';
import { setPageModeAtom } from '../atoms';

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
        getOrCreateWorkspace(workspaceId, WorkspaceFlavour.LOCAL);
        saveWorkspaceToLocalStorage(workspaceId);
        set(workspaces => [
          ...workspaces,
          {
            id: workspaceId,
            flavour: WorkspaceFlavour.LOCAL,
            version: WorkspaceVersion.DatabaseV3,
          },
        ]);
        logger.debug('imported local workspace', workspaceId);
        return workspaceId;
      },
      [set]
    ),
    createLocalWorkspace: useCallback(
      async (name: string): Promise<string> => {
        const blockSuiteWorkspace = getOrCreateWorkspace(
          nanoid(),
          WorkspaceFlavour.LOCAL
        );
        blockSuiteWorkspace.meta.setName(name);
        const id = await LocalAdapter.CRUD.create(blockSuiteWorkspace);
        {
          // this is hack, because CRUD doesn't return the workspace
          const blockSuiteWorkspace = getOrCreateWorkspace(
            id,
            WorkspaceFlavour.LOCAL
          );
          await buildShowcaseWorkspace(blockSuiteWorkspace, {
            store: getCurrentStore(),
            atoms: {
              pageMode: setPageModeAtom,
            },
          });
        }
        set(workspaces => [
          ...workspaces,
          {
            id,
            flavour: WorkspaceFlavour.LOCAL,
            version: WorkspaceVersion.DatabaseV3,
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
