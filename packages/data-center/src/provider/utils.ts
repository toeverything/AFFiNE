import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import assert from 'assert';

import { getDefaultHeadImgBlob } from '../utils';

export const setDefaultAvatar = async (
  blocksuiteWorkspace: BlocksuiteWorkspace
) => {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = await getDefaultHeadImgBlob(blocksuiteWorkspace.meta.name);
  if (!blob) {
    return;
  }
  const blobStorage = await blocksuiteWorkspace.blobs;
  assert(blobStorage, 'No blob storage');
  const avatar = await blobStorage.set(blob);
  if (avatar) {
    blocksuiteWorkspace.meta.setAvatar(avatar);
  }
};
