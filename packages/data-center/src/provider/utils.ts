import assert from 'assert';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { getDefaultHeadImgBlob } from '../utils/index.js';

export const setDefaultAvatar = async (
  blocksuiteWorkspace: BlocksuiteWorkspace
) => {
  const blob = await getDefaultHeadImgBlob(blocksuiteWorkspace.meta.name);
  const blobStorage = await blocksuiteWorkspace.blobs;
  assert(blobStorage, 'No blob storage');
  const blobId = await blobStorage.set(blob);
  const avatar = await blobStorage.get(blobId);
  if (avatar) {
    blocksuiteWorkspace.meta.setAvatar(avatar);
  }
};
