import { BlobStorage } from '@blocksuite/store';
import { useEffect, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export function useWorkspaceBlob(
  blockSuiteWorkspace: BlockSuiteWorkspace
): BlobStorage | null | undefined {
  const [blobStorage, setBlobStorage] = useState<
    BlobStorage | null | undefined
  >();
  useEffect(() => {
    blockSuiteWorkspace.blobs
      .then(blobStorage => {
        setBlobStorage(blobStorage);
      })
      .catch(() => setBlobStorage(null));
  }, [blockSuiteWorkspace]);
  return blobStorage;
}

export function useWorkspaceBlobImage(
  key: string,
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const blobStorage = useWorkspaceBlob(blockSuiteWorkspace);
  const [imageURL, setImageURL] = useState<string | undefined | null>();
  useEffect(() => {
    if (blobStorage === null) return setImageURL(null);

    const controller = new AbortController();
    blobStorage
      ?.get(key)
      .then(blob => {
        if (controller.signal.aborted) {
          setImageURL(null);
          return;
        }
        setImageURL(blob);
      })
      .catch(() => {
        setImageURL(null);
      });
    return () => {
      controller.abort();
    };
  }, [blobStorage, key]);
  return imageURL;
}
