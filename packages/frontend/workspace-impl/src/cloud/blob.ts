import {
  deleteBlobMutation,
  fetchWithTraceReport,
  getBaseUrl,
  GraphQLError,
  listBlobsQuery,
  setBlobMutation,
} from '@affine/graphql';
import { fetcher } from '@affine/graphql';
import { type BlobStorage, BlobStorageOverCapacity } from '@toeverything/infra';
import { isArray } from 'lodash-es';

import { bufferToBlob } from '../utils/buffer-to-blob';

export class AffineCloudBlobStorage implements BlobStorage {
  constructor(private readonly workspaceId: string) {}

  name = 'affine-cloud';
  readonly = false;

  async get(key: string) {
    const suffix = key.startsWith('/')
      ? key
      : `/api/workspaces/${this.workspaceId}/blobs/${key}`;

    return fetchWithTraceReport(getBaseUrl() + suffix).then(async res => {
      if (!res.ok) {
        // status not in the range 200-299
        return null;
      }
      return bufferToBlob(await res.arrayBuffer());
    });
  }

  async set(key: string, value: Blob) {
    // set blob will check blob size & quota
    return await fetcher({
      query: setBlobMutation,
      variables: {
        workspaceId: this.workspaceId,
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
  }

  async delete(key: string) {
    await fetcher({
      query: deleteBlobMutation,
      variables: {
        workspaceId: key,
        hash: key,
      },
    });
  }

  async list() {
    const result = await fetcher({
      query: listBlobsQuery,
      variables: {
        workspaceId: this.workspaceId,
      },
    });
    return result.listBlobs;
  }
}
