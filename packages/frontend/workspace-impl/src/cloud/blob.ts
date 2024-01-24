import {
  deleteBlobMutation,
  fetchWithTraceReport,
  getBaseUrl,
  GraphQLError,
  listBlobsQuery,
  setBlobMutation,
} from '@affine/graphql';
import { fetcher } from '@affine/graphql';
import type { BlobStorage } from '@affine/workspace';
import { BlobStorageOverCapacity } from '@affine/workspace';
import { isArray } from 'lodash-es';

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
      return await fetcher({
        query: setBlobMutation,
        variables: {
          workspaceId,
          blob: new File([value], key),
        },
      })
        .then(res => res.setBlob)
        .catch(err => {
          if (isArray(err)) {
            err.map(e => {
              if (e instanceof GraphQLError && e.extensions.code === 413) {
                throw new BlobStorageOverCapacity(e);
              } else throw e;
            });
          }
          throw err;
        });
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
