import { rootStore, rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { useEffect } from 'react';

import { WorkspacePlugins } from '../plugins';

/**
 * @deprecated DO NOT USE THIS HOOK ANYMORE
 */
export function useCreateFirstWorkspace() {
  // may not need use effect at all, right?
  useEffect(() => {
    return rootStore.sub(rootWorkspacesMetadataAtom, () => {
      const workspaces = rootStore.get(rootWorkspacesMetadataAtom);

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
          await Plugin.Events['app:init']?.(rootStore);
        }
      }
    });
  }, []);
}
