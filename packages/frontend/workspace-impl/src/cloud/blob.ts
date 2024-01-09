import {
  deleteBlobMutation,
  fetchWithTraceReport,
  getBaseUrl,
  listBlobsQuery,
  setBlobMutation,
} from '@affine/graphql';
import { fetcher } from '@affine/graphql';
import type { BlobStorage } from '@affine/workspace';

import { bufferToBlob } from '../utils/buffer-to-blob';

export const createAffineCloudBlobStorage = (
  workspaceId: string
): BlobStorage => {
  return {
    name: 'affine-cloud',
    readonly: false,
    get: async key => {
      const suffix = key.startsWith('/')
        ? key
        : `/api/workspaces/${workspaceId}/blobs/${key}`;

      return fetchWithTraceReport(getBaseUrl() + suffix).then(async res => {
        if (!res.ok) {
          // status not in the range 200-299
          return null;
        }
        return bufferToBlob(await res.arrayBuffer());
      });
    },
    set: async (key, value) => {
      // set blob will check blob size & quota
      const result = await fetcher({
        query: setBlobMutation,
        variables: {
          workspaceId,
          blob: new File([value], key),
        },
      });
      return result.setBlob;
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
  };
};
