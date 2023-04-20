import type { BlobStorage } from '@blocksuite/store';

export const createSQLiteStorage = (workspaceId: string): BlobStorage => {
  return {
    crud: {
      get: async (key: string) => {
        const buffer = await window.apis.db.getBlob(workspaceId, key);
        return buffer ? new Blob([buffer]) : null;
      },
      set: async (key: string, value: Blob) => {
        return window.apis.db.addBlob(
          workspaceId,
          key,
          new Uint8Array(await value.arrayBuffer())
        );
      },
      delete: async (key: string) => {
        return window.apis.db.deleteBlob(workspaceId, key);
      },
      list: async () => {
        return window.apis.db.getPersistedBlobs(workspaceId);
      },
    },
  };
};
