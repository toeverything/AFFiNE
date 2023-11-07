import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import reduce from 'image-blob-reduce';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

// validate and reduce image size and return as file
export const validateAndReduceImage = async (file: File): Promise<File> => {
  // Declare a new async function that wraps the decode logic
  const decodeAndReduceImage = async (): Promise<Blob> => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    await img.decode().catch(() => {
      URL.revokeObjectURL(url);
      throw new Error('Image could not be decoded');
    });

    img.onload = img.onerror = () => {
      URL.revokeObjectURL(url);
    };

    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > 10 || img.width > 4000 || img.height > 4000) {
      // Compress the file to less than 10MB
      const compressedImg = await reduce().toBlob(file, {
        max: 4000,
        unsharpAmount: 80,
        unsharpRadius: 0.6,
        unsharpThreshold: 2,
      });
      return compressedImg;
    }

    return file;
  };

  try {
    const reducedBlob = await decodeAndReduceImage();

    return new File([reducedBlob], file.name, { type: file.type });
  } catch (error) {
    throw new Error('Image could not be reduce :' + error);
  }
};

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
      const blobs = blockSuiteWorkspace.blob;
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
        const reducedFile = await validateAndReduceImage(file);
        const blobs = blockSuiteWorkspace.blob;
        const blobId = await blobs.set(reducedFile);
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
