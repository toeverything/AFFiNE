import {
  deleteBlobMutation,
  fetchWithReport,
  listBlobsQuery,
  setBlobMutation,
} from '@affine/graphql';
import type { BlobStorage } from '@blocksuite/store';

import { fetcher } from '../affine/gql';

export const createCloudBlobStorage = (workspaceId: string): BlobStorage => {
  return {
    crud: {
      get: async key => {
        return fetchWithReport(
          runtimeConfig.serverUrlPrefix +
            `/api/workspaces/${workspaceId}/blobs/${key}`
        ).then(res => res.blob());
      },
      set: async (key, value) => {
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
