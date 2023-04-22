import type { BlobStorage } from '@blocksuite/store';

export const createSQLiteStorage = (workspaceId: string): BlobStorage => {
  return {
    crud: {
      get: async (key: string) => {
        const buffer = await rpc.getBlob(workspaceId, key);
        return buffer ? new Blob([buffer]) : null;
      },
      set: async (key: string, value: Blob) => {
        return rpc.addBlob(
          workspaceId,
          key,
          new Uint8Array(await value.arrayBuffer())
        );
      },
      delete: async (key: string) => {
        return rpc.deleteBlob(workspaceId, key);
      },
      list: async () => {
        return rpc.getPersistedBlobs(workspaceId);
      },
    },
  };
};
