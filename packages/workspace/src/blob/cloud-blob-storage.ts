import {
  checkBlobSizesQuery,
  deleteBlobMutation,
  fetchWithTraceReport,
  listBlobsQuery,
  setBlobMutation,
} from '@affine/graphql';
import type { BlobStorage } from '@blocksuite/store';

import { fetcher } from '../affine/gql';

export const createCloudBlobStorage = (workspaceId: string): BlobStorage => {
  return {
    crud: {
      get: async key => {
        return fetchWithTraceReport(
          runtimeConfig.serverUrlPrefix +
            `/api/workspaces/${workspaceId}/blobs/${key}`
        ).then(res => res.blob());
      },
      set: async (key, value) => {
        const {
          checkBlobSize: { size },
        } = await fetcher({
          query: checkBlobSizesQuery,
          variables: {
            workspaceId,
            size: value.size,
          },
        });

        if (size <= 0) {
          throw new Error('Blob size limit exceeded');
        }

        const result = await fetcher({
          query: setBlobMutation,
          variables: {
            workspaceId,
            blob: new File([value], key),
          },
        });
        console.assert(result.setBlob === key, 'Blob hash mismatch');
        return key;
      },
      list: async () => {
        const result = await fetcher({
          query: listBlobsQuery,
          variables: {
            workspaceId,
          },
        });
        return result.listBlobs;
      },
      delete: async (key: string) => {
        await fetcher({
          query: deleteBlobMutation,
          variables: {
            workspaceId,
            hash: key,
          },
        });
      },
    },
  };
};
