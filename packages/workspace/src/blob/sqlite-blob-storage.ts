import type { BlobStorage } from '@blocksuite/store';

export const createSQLiteStorage = (workspaceId: string): BlobStorage => {
  return {
    crud: {
      get: async (key: string) => {
        // @ts-expect-error
        const buffer = await rpc.getBlob(workspaceId, key);
        return buffer ? new Blob([buffer]) : null;
      },
      set: async (key: string, value: Blob) => {
        // @ts-expect-error
        return rpc.addBlob(
          workspaceId,
          key,
          new Uint8Array(await value.arrayBuffer())
        );
      },
      delete: async (key: string) => {
        // @ts-expect-error
        return rpc.deleteBlob(workspaceId, key);
      },
      list: async () => {
        // @ts-expect-error
        return rpc.getPersistedBlobs(workspaceId);
      },
    },
  };
};
