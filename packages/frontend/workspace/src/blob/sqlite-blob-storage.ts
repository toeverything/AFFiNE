import { assertExists } from '@blocksuite/global/utils';
import type { BlobStorage } from '@blocksuite/store';

import { isSvgBuffer } from './util';

export const createSQLiteStorage = (workspaceId: string): BlobStorage => {
  const apis = window.apis;
  assertExists(apis);
  return {
    crud: {
      get: async (key: string) => {
        const buffer = await apis.db.getBlob(workspaceId, key);
        if (buffer) {
          const isSVG = isSvgBuffer(buffer);
          // for svg blob, we need to explicitly set the type to image/svg+xml
          return isSVG
            ? new Blob([buffer], { type: 'image/svg+xml' })
            : new Blob([buffer]);
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
    },
  };
};
