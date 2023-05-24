import { rootStore, rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import type { AffineLegacyCloudWorkspace } from '@affine/workspace/type';
import { useCallback } from 'react';
import useSWR from 'swr';

import { QueryKey } from '../../adapters/affine/fetcher';
import { affineApis } from '../../shared/apis';

export function useToggleWorkspacePublish(
  workspace: AffineLegacyCloudWorkspace
) {
  const { mutate } = useSWR(QueryKey.getWorkspaces);
  return useCallback(
    async (isPublish: boolean) => {
      await affineApis.updateWorkspace({
        id: workspace.id,
        public: isPublish,
      });
      await mutate(QueryKey.getWorkspaces);
      // fixme: remove force update
      rootStore.set(rootWorkspacesMetadataAtom, ws => [...ws]);
    },
    [mutate, workspace.id]
  );
}
