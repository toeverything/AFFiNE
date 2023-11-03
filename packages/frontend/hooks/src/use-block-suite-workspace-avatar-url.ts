import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

export function validateImage(file: File) {
  return new Promise((resolve, reject) => {
    // check file size
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > 10) {
      reject('File is too large, please select a file less than 10MB');
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      // check image dimensions
      if (img.width > 4000 || img.height > 4000) {
        img.src = '';
        URL.revokeObjectURL(url);
        reject('Image dimensions are too large. Maximum size is 4K');
        return;
      }
      img
        .decode()
        .then(() => {
          URL.revokeObjectURL(url);
          resolve('Image is valid.');
        })
        .catch(error => {
          URL.revokeObjectURL(url);
          reject('Image could not be decoded: ' + error);
        });
    };

    img.onerror = error => {
      URL.revokeObjectURL(url);
      reject('Image could not be loaded: ' + error);
    };

    img.src = url;
  });
}

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
      const blobs = blockSuiteWorkspace.blobs;
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
    async (file: File | null): Promise<boolean> => {
      assertExists(blockSuiteWorkspace);
      if (!file) {
        blockSuiteWorkspace.meta.setAvatar('');
        return false;
      }
      try {
        await validateImage(file);
        const blob = new Blob([file], { type: file.type });
        const blobs = blockSuiteWorkspace.blobs;
        const blobId = await blobs.set(blob);
        blockSuiteWorkspace.meta.setAvatar(blobId);
        await mutate(blobId);
        return true;
      } catch (error) {
        console.error(error);
        throw error;
      }
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
