import type { Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useCallback } from 'react';
import useSWR from 'swr';

export function useBlockSuiteWorkspaceAvatarUrl(
  // todo: remove `null` from type
  blockSuiteWorkspace: Workspace | null
) {
  const { data: avatar, mutate } = useSWR(
    blockSuiteWorkspace && blockSuiteWorkspace.meta.avatar
      ? [blockSuiteWorkspace.id, blockSuiteWorkspace.meta.avatar]
      : null,
    {
      fetcher: async ([id, avatar]) => {
        assertExists(blockSuiteWorkspace);
        const blobs = await blockSuiteWorkspace.blobs;
        if (blobs) {
          return blobs.get(avatar);
        }
        return null;
      },
      suspense: true,
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
