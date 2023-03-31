import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env';
import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertEquals, assertExists, nanoid } from '@blocksuite/store';
import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';

import { LocalPlugin } from '../plugins/local';

const logger = new DebugLogger('use-create-first-workspace');

export function useCreateFirstWorkspace() {
  const [jotaiWorkspaces, set] = useAtom(jotaiWorkspacesAtom);
  const creatingFirst = useRef(false);
  useEffect(() => {
    /**
     * Create a first workspace, only just once for a browser
     */
    async function createFirst() {
      creatingFirst.current = true;
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        nanoid(),
        (_: string) => undefined
      );
      blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      const id = await LocalPlugin.CRUD.create(blockSuiteWorkspace);
      const workspace = await LocalPlugin.CRUD.get(id);
      assertExists(workspace);
      assertEquals(workspace.id, id);
      set([
        {
          id: workspace.id,
          flavour: WorkspaceFlavour.LOCAL,
        },
      ]);
      logger.info('created local workspace', id);
      creatingFirst.current = false;
    }
    if (jotaiWorkspaces.length === 0 && !creatingFirst.current) {
      createFirst();
    }
  }, [jotaiWorkspaces.length, set]);
}
