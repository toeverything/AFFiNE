import { useCallback } from 'react';
import { mutate } from 'swr';

import { QueryKey } from '../../plugins/affine/fetcher';
import { AffineWorkspace } from '../../shared';
import { apis } from '../../shared/apis';
import { refreshDataCenter } from '../use-workspaces';

export function useToggleWorkspacePublish(workspace: AffineWorkspace) {
  return useCallback(
    async (isPublish: boolean) => {
      await apis.updateWorkspace({
        id: workspace.id,
        public: isPublish,
      });
      await mutate(QueryKey.getWorkspaces);
      await refreshDataCenter();
    },
    [workspace]
  );
}
