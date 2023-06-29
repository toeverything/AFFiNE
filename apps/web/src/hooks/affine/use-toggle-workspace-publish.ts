import type { AffineLegacyCloudWorkspace } from '@affine/env/workspace';
import { affineApis } from '@affine/workspace/affine/shared';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { rootStore } from '@toeverything/plugin-infra/manager';
import { useCallback } from 'react';
import useSWR from 'swr';

import { QueryKey } from '../../adapters/affine/fetcher';

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
      await rootStore.set(rootWorkspacesMetadataAtom, ws => [...ws]);
    },
    [mutate, workspace.id]
  );
}
