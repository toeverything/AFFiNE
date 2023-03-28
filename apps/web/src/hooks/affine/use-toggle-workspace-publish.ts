import { useCallback } from 'react';
import useSWR from 'swr';

import { jotaiStore, jotaiWorkspacesAtom } from '../../atoms';
import { QueryKey } from '../../plugins/affine/fetcher';
import type { AffineWorkspace } from '../../shared';
import { affineApis } from '../../shared/apis';

export function useToggleWorkspacePublish(workspace: AffineWorkspace) {
  const { mutate } = useSWR(QueryKey.getWorkspaces);
  return useCallback(
    async (isPublish: boolean) => {
      await affineApis.updateWorkspace({
        id: workspace.id,
        public: isPublish,
      });
      await mutate(QueryKey.getWorkspaces);
      // force update
      jotaiStore.set(jotaiWorkspacesAtom, [
        ...jotaiStore.get(jotaiWorkspacesAtom),
      ]);
    },
    [mutate, workspace.id]
  );
}
