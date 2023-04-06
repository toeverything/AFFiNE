import { jotaiStore, jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { useEffect } from 'react';

import { WorkspacePlugins } from '../plugins';

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
        const Plugins = Object.values(WorkspacePlugins).sort(
          (a, b) => a.loadPriority - b.loadPriority
        );

        for (const Plugin of Plugins) {
          await Plugin.Events['app:first-init']?.();
        }
      }
    });
  }, []);
}
