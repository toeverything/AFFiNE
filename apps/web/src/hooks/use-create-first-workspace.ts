import { DEFAULT_WORKSPACE_NAME } from '@affine/env';
import { assertEquals, assertExists, nanoid } from '@blocksuite/store';
import { useAtom } from 'jotai/index';
import { useEffect } from 'react';

import { jotaiWorkspacesAtom } from '../atoms';
import { LocalPlugin } from '../plugins/local';
import { RemWorkspaceFlavour } from '../shared';
import { createEmptyBlockSuiteWorkspace } from '../utils';

export function useCreateFirstWorkspace() {
  const [jotaiWorkspaces, set] = useAtom(jotaiWorkspacesAtom);
  useEffect(() => {
    const controller = new AbortController();

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
      set([
        {
          id: workspace.id,
          flavour: RemWorkspaceFlavour.LOCAL,
        },
      ]);
    }
    if (
      jotaiWorkspaces.length === 0 &&
      localStorage.getItem('first') !== 'true'
    ) {
      localStorage.setItem('first', 'true');
      createFirst();
    }
    return () => {
      controller.abort();
    };
  }, [jotaiWorkspaces.length, set]);
}
