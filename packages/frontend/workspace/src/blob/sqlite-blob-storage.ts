import { assertExists } from '@blocksuite/global/utils';
import type { BlobStorage } from '@blocksuite/store';

export const createSQLiteStorage = (workspaceId: string): BlobStorage => {
  const apis = window.apis;
  assertExists(apis);
  const typeMap = new Map();
  return {
    crud: {
      get: async (key: string) => {
        const buffer = await apis.db.getBlob(workspaceId, key);
        return buffer ? new Blob([buffer], { type: typeMap.get(key) ?? buffer.type }) : null;
      },
      set: async (key: string, value: Blob) => {
        typeMap.set(key, value.type);
        await apis.db.addBlob(
          workspaceId,
          key,
          new Uint8Array(await value.arrayBuffer())
        );
        return key;
      },
      delete: async (key: string) => {
        typeMap.delete(key);
        return apis.db.deleteBlob(workspaceId, key);
      },
      list: async () => {
        return apis.db.getBlobKeys(workspaceId);
      },
    },
  };
};
