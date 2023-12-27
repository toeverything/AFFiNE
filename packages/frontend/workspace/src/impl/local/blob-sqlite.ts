import { apis } from '@affine/electron-api';
import { assertExists } from '@blocksuite/global/utils';

import type { BlobStorage } from '../../engine/blob';
import { bufferToBlob } from '../../utils/buffer-to-blob';

export const createSQLiteBlobStorage = (workspaceId: string): BlobStorage => {
  assertExists(apis);
  return {
    name: 'sqlite',
    readonly: false,
    get: async (key: string) => {
      assertExists(apis);
      const buffer = await apis.db.getBlob(workspaceId, key);
      if (buffer) {
        return bufferToBlob(buffer);
      }
      return null;
    },
    set: async (key: string, value: Blob) => {
      assertExists(apis);
      await apis.db.addBlob(
        workspaceId,
        key,
        new Uint8Array(await value.arrayBuffer())
      );
      return key;
    },
    delete: async (key: string) => {
      assertExists(apis);
      return apis.db.deleteBlob(workspaceId, key);
    },
    list: async () => {
      assertExists(apis);
      return apis.db.getBlobKeys(workspaceId);
    },
  };
};
