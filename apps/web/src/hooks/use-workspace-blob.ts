import { BlobStorage } from '@blocksuite/store';
import { useEffect, useState } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export function useWorkspaceBlob(
  blockSuiteWorkspace: BlockSuiteWorkspace
): BlobStorage | null {
  const [blobStorage, setBlobStorage] = useState<BlobStorage | null>(null);
  useEffect(() => {
    blockSuiteWorkspace.blobs.then(blobStorage => {
      setBlobStorage(blobStorage);
    });
  }, [blockSuiteWorkspace]);
  return blobStorage;
}

export function useWorkspaceBlobImage(
  key: string | null,
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const blobStorage = useWorkspaceBlob(blockSuiteWorkspace);
  const [imageURL, setImageURL] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (key === null) {
      setImageURL(null);
      return;
    }
    blobStorage?.get(key).then(blob => {
      if (controller.signal.aborted) {
        return;
      }
      setImageURL(blob);
    });
    return () => {
      controller.abort();
    };
  }, [blobStorage, key]);
  return imageURL;
}
