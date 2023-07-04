import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

export function useBlockSuiteWorkspaceAvatarUrl(
  blockSuiteWorkspace: Workspace
) {
  const [url, set] = useState(() => blockSuiteWorkspace.meta.avatar);
  if (url !== blockSuiteWorkspace.meta.avatar) {
    set(blockSuiteWorkspace.meta.avatar);
  }
  const { data: avatar, mutate } = useSWR(url, {
    fetcher: async avatar => {
      assertExists(blockSuiteWorkspace);
      const blobs = await blockSuiteWorkspace.blobs;
      const blob = await blobs.get(avatar);
      if (blob) {
        return URL.createObjectURL(blob);
      }
      return null;
    },
    suspense: true,
    fallbackData: null,
  });
  const setAvatar = useCallback(
    async (file: File) => {
      assertExists(blockSuiteWorkspace);
      const blob = new Blob([file], { type: file.type });
      const blobs = await blockSuiteWorkspace.blobs;
      const blobId = await blobs.set(blob);
      blockSuiteWorkspace.meta.setAvatar(blobId);
      await mutate(blobId);
    },
    [blockSuiteWorkspace, mutate]
  );
  useEffect(() => {
    if (blockSuiteWorkspace) {
      const dispose = blockSuiteWorkspace.meta.commonFieldsUpdated.on(() => {
        set(blockSuiteWorkspace.meta.avatar);
      });
      return () => {
        dispose.dispose();
      };
    }
    return;
  }, [blockSuiteWorkspace]);
  return [avatar ?? null, setAvatar] as const;
}
