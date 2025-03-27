import { UserFriendlyError } from '@affine/error';
import {
  deleteBlobMutation,
  listBlobsQuery,
  releaseDeletedBlobsMutation,
  setBlobMutation,
  workspaceQuotaQuery,
} from '@affine/graphql';

import {
  type BlobRecord,
  BlobStorageBase,
  OverCapacityError,
  OverSizeError,
} from '../../storage';
import { HttpConnection } from './http';

interface CloudBlobStorageOptions {
  serverBaseUrl: string;
  id: string;
}

export class CloudBlobStorage extends BlobStorageBase {
  static readonly identifier = 'CloudBlobStorage';
  override readonly isReadonly = false;

  constructor(private readonly options: CloudBlobStorageOptions) {
    super();
  }

  readonly connection = new HttpConnection(this.options.serverBaseUrl);

  override async get(key: string, signal?: AbortSignal) {
    const res = await this.connection.fetch(
      '/api/workspaces/' + this.options.id + '/blobs/' + key,
      {
        cache: 'default',
        headers: {
          'x-affine-version': BUILD_CONFIG.appVersion,
        },
        signal,
      }
    );

    if (res.status === 404) {
      return null;
    }

    try {
      const blob = await res.blob();

      return {
        key,
        data: new Uint8Array(await blob.arrayBuffer()),
        mime: blob.type,
        size: blob.size,
        createdAt: new Date(res.headers.get('last-modified') || Date.now()),
      };
    } catch (err) {
      throw new Error('blob download error: ' + err);
    }
  }

  override async set(blob: BlobRecord, signal?: AbortSignal) {
    try {
      const blobSizeLimit = await this.getBlobSizeLimit();
      if (blob.data.byteLength > blobSizeLimit) {
        throw new OverSizeError();
      }
      await this.connection.gql({
        query: setBlobMutation,
        variables: {
          workspaceId: this.options.id,
          blob: new File([blob.data], blob.key, { type: blob.mime }),
        },
        context: {
          signal,
        },
      });
    } catch (err) {
      const userFriendlyError = UserFriendlyError.fromAny(err);
      if (userFriendlyError.is('STORAGE_QUOTA_EXCEEDED')) {
        throw new OverCapacityError();
      }
      if (userFriendlyError.is('BLOB_QUOTA_EXCEEDED')) {
        throw new OverSizeError();
      }
      if (userFriendlyError.is('CONTENT_TOO_LARGE')) {
        throw new OverSizeError();
      }
      throw err;
    }
  }

  override async delete(key: string, permanently: boolean) {
    await this.connection.gql({
      query: deleteBlobMutation,
      variables: { workspaceId: this.options.id, key, permanently },
    });
  }

  override async release() {
    await this.connection.gql({
      query: releaseDeletedBlobsMutation,
      variables: { workspaceId: this.options.id },
    });
  }

  override async list() {
    const res = await this.connection.gql({
      query: listBlobsQuery,
      variables: { workspaceId: this.options.id },
    });

    return res.workspace.blobs.map(blob => ({
      ...blob,
      createdAt: new Date(blob.createdAt),
    }));
  }

  private blobSizeLimitCache: number | null = null;
  private blobSizeLimitCacheTime = 0;
  private async getBlobSizeLimit() {
    // If cache time is less than 120 seconds, return the cached value directly
    if (
      this.blobSizeLimitCache !== null &&
      Date.now() - this.blobSizeLimitCacheTime < 120 * 1000
    ) {
      return this.blobSizeLimitCache;
    }
    try {
      const res = await this.connection.gql({
        query: workspaceQuotaQuery,
        variables: { id: this.options.id },
      });

      this.blobSizeLimitCache = res.workspace.quota.blobLimit;
      this.blobSizeLimitCacheTime = Date.now();
      return this.blobSizeLimitCache;
    } catch (err) {
      throw UserFriendlyError.fromAny(err);
    }
  }
}
