import { assertExists } from '@blocksuite/global/utils';
import type { BlobStorage } from '@blocksuite/store';

import { fetcher } from '../affine/gql';

export const createCloudBlobStorage = (): BlobStorage => {
  assertExists(fetcher);
  return {
    crud: {
      get: async () => {
        throw new Error('Not implemented');
      },
      set: async () => {
        throw new Error('Not implemented');
      },
      list: async () => {
        throw new Error('Not implemented');
      },
      delete: async () => {
        throw new Error('Not implemented');
      },
    },
  };
};
