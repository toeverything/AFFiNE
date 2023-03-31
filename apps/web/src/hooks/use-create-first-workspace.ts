import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env';
import { jotaiStore, jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertEquals, assertExists, nanoid } from '@blocksuite/store';
import { useEffect } from 'react';

import { LocalPlugin } from '../plugins/local';

const logger = new DebugLogger('use-create-first-workspace');

export function useCreateFirstWorkspace() {
  // may not need use effect at all, right?
  useEffect(() => {
    return jotaiStore.sub(jotaiWorkspacesAtom, () => {
      const workspaces = jotaiStore.get(jotaiWorkspacesAtom);

      if (workspaces.length === 0) {
        createFirst();
      }

      /**
       * Create a first workspace, only just once for a browser
       */
      async function createFirst() {
        const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          (_: string) => undefined
        );
        blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
        const id = await LocalPlugin.CRUD.create(blockSuiteWorkspace);
        const workspace = await LocalPlugin.CRUD.get(id);
        assertExists(workspace);
        assertEquals(workspace.id, id);
        jotaiStore.set(jotaiWorkspacesAtom, [
          {
            id: workspace.id,
            flavour: WorkspaceFlavour.LOCAL,
          },
        ]);
        logger.info('created local workspace', id);
      }
    });
  }, []);
}
