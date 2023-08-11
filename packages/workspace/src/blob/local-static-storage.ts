import type { BlobStorage } from '@blocksuite/store';

export const createStaticStorage = (): BlobStorage & { type: string } => {
  return {
    type: 'Static',
    crud: {
      get: async (key: string) => {
        if (key.startsWith('/static/')) {
          const response = await fetch(key);
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
