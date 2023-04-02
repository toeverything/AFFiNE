import { assertExists } from '@blocksuite/store';
import { useCallback } from 'react';
import useSWR from 'swr';

import { QueryKey } from '../plugins/affine/fetcher';
import type { BlockSuiteWorkspace } from '../shared';

export function useBlockSuiteWorkspaceAvatarUrl(
  // todo: remove `null` from type
  blockSuiteWorkspace: BlockSuiteWorkspace | null
) {
  const { data: avatar, mutate } = useSWR(
    blockSuiteWorkspace
      ? [
          QueryKey.getImage,
          blockSuiteWorkspace.id,
          blockSuiteWorkspace.meta.avatar,
        ]
      : null,
    {
      fallbackData: null,
    }
  );
  const setAvatar = useCallback(
    async (file: File) => {
      assertExists(blockSuiteWorkspace);
      const blob = new Blob([file], { type: file.type });
      const blobs = await blockSuiteWorkspace.blobs;
      assertExists(blobs);
      const blobId = await blobs.set(blob);
      blockSuiteWorkspace.meta.setAvatar(blobId);
      await mutate(blobId);
    },
    [blockSuiteWorkspace, mutate]
  );
  return [avatar ?? null, setAvatar] as const;
}
