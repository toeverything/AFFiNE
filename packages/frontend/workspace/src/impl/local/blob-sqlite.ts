import { assertExists } from '@blocksuite/global/utils';

import type { BlobStorage } from '../../engine/blob';
import { bufferToBlob } from '../../utils/buffer-to-blob';

export const createSQLiteBlobStorage = (workspaceId: string): BlobStorage => {
  const apis = window.apis;
  assertExists(apis);
  return {
    name: 'sqlite',
    readonly: false,
    get: async (key: string) => {
      const buffer = await apis.db.getBlob(workspaceId, key);
      if (buffer) {
        return bufferToBlob(buffer);
      }
      return null;
    },
    set: async (key: string, value: Blob) => {
      await apis.db.addBlob(
        workspaceId,
        key,
        new Uint8Array(await value.arrayBuffer())
      );
      return key;
    },
    delete: async (key: string) => {
      return apis.db.deleteBlob(workspaceId, key);
    },
    list: async () => {
      return apis.db.getBlobKeys(workspaceId);
    },
  };
};
