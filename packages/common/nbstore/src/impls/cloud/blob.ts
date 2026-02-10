import { UserFriendlyError } from '@affine/error';
import {
  abortBlobUploadMutation,
  BlobUploadMethod,
  completeBlobUploadMutation,
  createBlobUploadMutation,
  deleteBlobMutation,
  getBlobUploadPartUrlQuery,
  listBlobsQuery,
  releaseDeletedBlobsMutation,
  setBlobMutation,
  workspaceBlobQuotaQuery,
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

const SHOULD_MANUAL_REDIRECT =
  BUILD_CONFIG.isAndroid || BUILD_CONFIG.isIOS || BUILD_CONFIG.isElectron;
const UPLOAD_REQUEST_TIMEOUT = 0;

export class CloudBlobStorage extends BlobStorageBase {
  static readonly identifier = 'CloudBlobStorage';
  override readonly isReadonly = false;

  constructor(private readonly options: CloudBlobStorageOptions) {
    super();
  }

  readonly connection = new HttpConnection(this.options.serverBaseUrl);

  override async get(key: string, signal?: AbortSignal) {
    const res = await this.connection.fetch(
      '/api/workspaces/' +
        this.options.id +
        '/blobs/' +
        key +
        (SHOULD_MANUAL_REDIRECT ? '?redirect=manual' : ''),
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
      const contentType = res.headers.get('content-type');

      let blob;

      if (
        SHOULD_MANUAL_REDIRECT &&
        contentType?.startsWith('application/json')
      ) {
        const json = await res.json();
        if ('url' in json && typeof json.url === 'string') {
          const res = await this.connection.fetch(json.url, {
            cache: 'default',
            headers: {
              'x-affine-version': BUILD_CONFIG.appVersion,
            },
            signal,
          });

          blob = await res.blob();
        } else {
          throw new Error('Invalid blob response');
        }
      } else {
        blob = await res.blob();
      }

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
        throw new OverSizeError(this.humanReadableBlobSizeLimitCache);
      }

      const init = await this.connection.gql({
        query: createBlobUploadMutation,
        variables: {
          workspaceId: this.options.id,
          key: blob.key,
          size: blob.data.byteLength,
          mime: blob.mime,
        },
        context: { signal },
      });

      const upload = init.createBlobUpload;
      if (upload.alreadyUploaded) {
        return;
      }
      if (upload.method === BlobUploadMethod.GRAPHQL) {
        await this.uploadViaGraphql(blob, signal);
        return;
      }

      if (upload.method === BlobUploadMethod.PRESIGNED) {
        try {
          await this.uploadViaPresigned(
            upload.uploadUrl!,
            upload.headers,
            blob.data,
            signal
          );
          await this.completeUpload(blob.key, undefined, undefined, signal);
          return;
        } catch {
          await this.uploadViaGraphql(blob, signal);
          return;
        }
      }

      if (upload.method === BlobUploadMethod.MULTIPART) {
        try {
          const parts = await this.uploadViaMultipart(
            blob.key,
            upload.uploadId!,
            upload.partSize!,
            blob.data,
            upload.uploadedParts,
            signal
          );
          await this.completeUpload(blob.key, upload.uploadId!, parts, signal);
          return;
        } catch {
          if (upload.uploadId) {
            await this.tryAbortMultipartUpload(
              blob.key,
              upload.uploadId,
              signal
            );
          }
          await this.uploadViaGraphql(blob, signal);
          return;
        }
      }

      await this.uploadViaGraphql(blob, signal);
    } catch (err) {
      const userFriendlyError = UserFriendlyError.fromAny(err);
      if (userFriendlyError.is('STORAGE_QUOTA_EXCEEDED')) {
        throw new OverCapacityError();
      }
      if (userFriendlyError.is('BLOB_QUOTA_EXCEEDED')) {
        throw new OverSizeError(this.humanReadableBlobSizeLimitCache);
      }
      if (userFriendlyError.is('CONTENT_TOO_LARGE')) {
        throw new OverSizeError(
          null,
          'Upload stopped by network proxy: file size exceeds the set limit.'
        );
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

  private async uploadViaGraphql(blob: BlobRecord, signal?: AbortSignal) {
    await this.connection.gql({
      query: setBlobMutation,
      variables: {
        workspaceId: this.options.id,
        blob: new File([blob.data], blob.key, { type: blob.mime }),
      },
      context: { signal },
      timeout: UPLOAD_REQUEST_TIMEOUT,
    });
  }

  private async uploadViaPresigned(
    uploadUrl: string,
    headers: Record<string, string> | null | undefined,
    data: Uint8Array,
    signal?: AbortSignal
  ) {
    const res = await this.fetchWithTimeout(uploadUrl, {
      method: 'PUT',
      headers: headers ?? undefined,
      body: data,
      signal,
      timeout: UPLOAD_REQUEST_TIMEOUT,
    });
    if (!res.ok) {
      throw new Error(`Presigned upload failed with status ${res.status}`);
    }
  }

  private async uploadViaMultipart(
    key: string,
    uploadId: string,
    partSize: number,
    data: Uint8Array,
    uploadedParts: { partNumber: number; etag: string }[] | null | undefined,
    signal?: AbortSignal
  ) {
    const partsMap = new Map<number, string>();
    for (const part of uploadedParts ?? []) {
      partsMap.set(part.partNumber, part.etag);
    }
    const total = data.byteLength;
    const totalParts = Math.ceil(total / partSize);

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      if (partsMap.has(partNumber)) {
        continue;
      }
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, total);
      const chunk = data.subarray(start, end);

      const part = await this.connection.gql({
        query: getBlobUploadPartUrlQuery,
        variables: { workspaceId: this.options.id, key, uploadId, partNumber },
        context: { signal },
      });

      const res = await this.fetchWithTimeout(
        part.workspace.blobUploadPartUrl.uploadUrl,
        {
          method: 'PUT',
          headers: part.workspace.blobUploadPartUrl.headers ?? undefined,
          body: chunk,
          signal,
          timeout: UPLOAD_REQUEST_TIMEOUT,
        }
      );
      if (!res.ok) {
        throw new Error(
          `Multipart upload failed at part ${partNumber} with status ${res.status}`
        );
      }

      const etag = res.headers.get('etag');
      if (!etag) {
        throw new Error(`Missing ETag for part ${partNumber}.`);
      }
      partsMap.set(partNumber, etag);
    }

    if (partsMap.size !== totalParts) {
      throw new Error('Multipart upload has missing parts.');
    }

    return [...partsMap.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([partNumber, etag]) => ({ partNumber, etag }));
  }

  private async completeUpload(
    key: string,
    uploadId: string | undefined,
    parts: { partNumber: number; etag: string }[] | undefined,
    signal?: AbortSignal
  ) {
    await this.connection.gql({
      query: completeBlobUploadMutation,
      variables: { workspaceId: this.options.id, key, uploadId, parts },
      context: { signal },
      timeout: UPLOAD_REQUEST_TIMEOUT,
    });
  }

  private async tryAbortMultipartUpload(
    key: string,
    uploadId: string,
    signal?: AbortSignal
  ) {
    try {
      await this.connection.gql({
        query: abortBlobUploadMutation,
        variables: { workspaceId: this.options.id, key, uploadId },
        context: { signal },
      });
    } catch {}
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit & { timeout?: number }
  ) {
    const externalSignal = init.signal;
    if (externalSignal?.aborted) {
      throw externalSignal.reason;
    }

    const abortController = new AbortController();
    externalSignal?.addEventListener('abort', reason => {
      abortController.abort(reason);
    });

    const timeout = init.timeout ?? 15000;
    const timeoutId =
      timeout > 0
        ? setTimeout(() => {
            abortController.abort(new Error('request timeout'));
          }, timeout)
        : undefined;

    try {
      const resolvedUrl = new URL(input, this.options.serverBaseUrl).toString();
      return await globalThis.fetch(resolvedUrl, {
        ...init,
        signal: abortController.signal,
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private humanReadableBlobSizeLimitCache: string | null = null;
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
        query: workspaceBlobQuotaQuery,
        variables: { id: this.options.id },
      });

      this.humanReadableBlobSizeLimitCache =
        res.workspace.quota.humanReadable.blobLimit;
      this.blobSizeLimitCache = res.workspace.quota.blobLimit;
      this.blobSizeLimitCacheTime = Date.now();
      return this.blobSizeLimitCache;
    } catch (err) {
      throw UserFriendlyError.fromAny(err);
    }
  }
}
