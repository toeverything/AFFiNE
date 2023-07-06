import type { BlobStorage } from '@blocksuite/store';

export const createStaticStorage = (): BlobStorage => {
  return {
    crud: {
      get: async (key: string) => {
        if (key.startsWith('$local$')) {
          const id = key.slice('$local$'.length);
          const path = `/static/${id}`;
          const response = await fetch(path);
          return response.blob();
        }
        return null;
      },
      set: async (key: string) => {
        // ignore
        return key;
      },
      delete: async () => {
        // ignore
      },
      list: async () => {
        // ignore
        return [];
      },
    },
  };
};
