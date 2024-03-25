import {
  deleteBlobMutation,
  fetcher,
  fetchWithTraceReport,
  findGraphQLError,
  getBaseUrl,
  listBlobsQuery,
  setBlobMutation,
} from '@affine/graphql';
import type { BlobStorage } from '@toeverything/infra';
import { BlobStorageOverCapacity } from '@toeverything/infra';

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
        const uploadError = findGraphQLError(
          err,
          e => e.extensions.code === 413
        );

        if (uploadError) {
          throw new BlobStorageOverCapacity(uploadError);
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
