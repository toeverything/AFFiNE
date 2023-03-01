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
  key: string,
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const blobStorage = useWorkspaceBlob(blockSuiteWorkspace);
  const [imageURL, setImageURL] = useState<string | null>(null);
  useEffect(() => {
    blobStorage?.get(key).then(blob => {
      setImageURL(blob);
    });
  }, [blobStorage, key]);
  return imageURL;
}
