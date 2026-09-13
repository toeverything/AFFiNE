import { Injectable } from '@nestjs/common';

import {
  BlobInvalid,
  Config,
  createStorageUploadToken,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  type PutObjectMetadata,
  type S3StorageConfig,
  SIGNED_URL_EXPIRED,
  type StorageProviderConfig,
  URLHelper,
} from '../../../base';
import { Models } from '../../../models';
import type { StorageProviderCapabilities } from '../../../native';
import { StorageRuntimeProvider } from '../../storage-runtime';
import { MULTIPART_PART_SIZE } from '../constants';

type UploadURLConfig = {
  signKey?: string;
  urlPrefix?: string;
};

type UploadProxyConfig = {
  signKey: string;
  urlPrefix: string;
};

@Injectable()
export class WorkspaceBlobStorage {
  constructor(
    private readonly models: Models,
    private readonly url: URLHelper,
    private readonly rt: StorageRuntimeProvider,
    private readonly config: Config
  ) {}

  async putReservation(
    workspaceId: string,
    key: string,
    reservationId: string,
    blob: Buffer,
    metadata: PutObjectMetadata
  ) {
    const storedMetadata = await this.rt.putObject(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      blob,
      metadata
    );
    return storedMetadata;
  }

  async capabilities(): Promise<StorageProviderCapabilities> {
    const capabilities = await this.rt.providerCapabilities('blob');
    const config = this.uploadURLConfig();
    if (!config) {
      return {
        ...capabilities,
        presignPut: false,
        multipartDirect: false,
        proxyUpload: false,
        serverMediatedOnly: true,
      };
    }
    if (!config.signKey) {
      return capabilities;
    }
    return {
      ...capabilities,
      presignPut: true,
      multipartDirect: true,
      proxyUpload: true,
      serverMediatedOnly: false,
    };
  }

  async presignPut(
    workspaceId: string,
    key: string,
    reservationId: string,
    metadata?: PutObjectMetadata
  ) {
    const config = this.uploadURLConfig();
    if (!config) return;
    if (config.signKey) {
      return this.createProxyUploadUrl(workspaceId, key, metadata, {
        signKey: config.signKey,
        urlPrefix: config.urlPrefix ?? this.url.baseUrl,
      });
    }
    const presigned = await this.rt.presignPut(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      metadata
    );
    return config.urlPrefix && presigned
      ? this.withURLPrefix(presigned, config.urlPrefix)
      : presigned;
  }

  async createMultipartUpload(
    workspaceId: string,
    key: string,
    reservationId: string,
    metadata?: PutObjectMetadata
  ) {
    return this.rt.createMultipartUpload(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      metadata
    );
  }

  async presignUploadPart(
    workspaceId: string,
    key: string,
    uploadId: string,
    partNumber: number
  ) {
    const config = this.uploadURLConfig();
    if (!config) return;
    const contentLength = await this.multipartPartContentLength(
      workspaceId,
      key,
      uploadId,
      partNumber
    );
    const reservationId = await this.reservationId(workspaceId, key);
    if (config.signKey) {
      return this.createProxyMultipartUrl(
        workspaceId,
        key,
        uploadId,
        partNumber,
        contentLength,
        {
          signKey: config.signKey,
          urlPrefix: config.urlPrefix ?? this.url.baseUrl,
        }
      );
    }
    const presigned = await this.rt.presignUploadPart(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      uploadId,
      partNumber
    );
    return config.urlPrefix && presigned
      ? this.withURLPrefix(presigned, config.urlPrefix)
      : presigned;
  }

  async listMultipartUploadParts(
    workspaceId: string,
    key: string,
    uploadId: string
  ) {
    const reservationId = await this.reservationId(workspaceId, key);
    return this.rt.listMultipartUploadParts(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      uploadId
    );
  }

  async completeMultipartUpload(
    workspaceId: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[]
  ) {
    const reservationId = await this.reservationId(workspaceId, key);
    return await this.rt.completeMultipartUpload(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      uploadId,
      parts
    );
  }

  async abortMultipartUpload(
    workspaceId: string,
    key: string,
    uploadId: string,
    reservationId: string
  ) {
    return await this.rt.abortMultipartUpload(
      'blob',
      this.reservationObjectKey(workspaceId, key, reservationId),
      uploadId
    );
  }

  async head(workspaceId: string, key: string) {
    return this.rt.headObject('blob', `${workspaceId}/${key}`);
  }

  getAvatarUrl(workspaceId: string, avatarKey: string | null) {
    if (!avatarKey) {
      return undefined;
    }
    const source = new URLSearchParams({
      sourceType: 'currentDoc',
      docId: workspaceId,
    });
    return this.url.link(
      `/api/workspaces/${workspaceId}/blobs/v1/${avatarKey}?${source}`
    );
  }

  private uploadURLConfig(): UploadURLConfig | undefined {
    const storage = this.config.storages.blob.storage as StorageProviderConfig;
    if (storage.provider !== 'cloudflare-r2' && storage.provider !== 'aws-s3') {
      return;
    }
    const usePresignedURL = (storage.config as S3StorageConfig).usePresignedURL;
    if (!usePresignedURL?.enabled) {
      return;
    }
    return {
      signKey: usePresignedURL.signKey || undefined,
      urlPrefix: usePresignedURL.urlPrefix || undefined,
    };
  }

  private createProxyUploadUrl(
    workspaceId: string,
    key: string,
    metadata: PutObjectMetadata | undefined,
    proxy: UploadProxyConfig
  ) {
    const contentType = metadata?.contentType ?? 'application/octet-stream';
    const contentLength = metadata?.contentLength;
    if (contentLength === undefined) {
      throw new BlobInvalid('Missing upload content length');
    }
    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRED * 1000);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
    const token = createStorageUploadToken(
      PROXY_UPLOAD_PATH,
      [workspaceId, key, contentType, contentLength],
      expiresAtSeconds,
      proxy.signKey
    );
    return {
      url: this.linkProxyUrl(proxy.urlPrefix, PROXY_UPLOAD_PATH, {
        workspaceId,
        key,
        contentType,
        contentLength,
        expiresAt: expiresAtSeconds,
        token,
      }),
      headers: {},
      expiresAt,
    };
  }

  private createProxyMultipartUrl(
    workspaceId: string,
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
    proxy: UploadProxyConfig
  ) {
    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRED * 1000);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
    const token = createStorageUploadToken(
      PROXY_MULTIPART_PATH,
      [workspaceId, key, uploadId, partNumber, contentLength],
      expiresAtSeconds,
      proxy.signKey
    );
    return {
      url: this.linkProxyUrl(proxy.urlPrefix, PROXY_MULTIPART_PATH, {
        workspaceId,
        key,
        uploadId,
        partNumber,
        contentLength,
        expiresAt: expiresAtSeconds,
        token,
      }),
      headers: {},
      expiresAt,
    };
  }

  private linkProxyUrl(
    urlPrefix: string,
    path: string,
    query: Record<string, string | number | undefined>
  ) {
    const url = new URL(
      `${urlPrefix.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    );
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value.toString());
      }
    }
    return url.toString();
  }

  private withURLPrefix<T extends { url: string }>(
    presigned: T,
    urlPrefix: string
  ): T {
    const url = new URL(presigned.url);
    const prefix = new URL(urlPrefix);
    if (prefix.pathname !== '/' || prefix.search || prefix.hash) {
      throw new BlobInvalid('Upload URL prefix must contain only an origin');
    }
    url.protocol = prefix.protocol;
    url.host = prefix.host;
    return { ...presigned, url: url.toString() };
  }

  private async multipartPartContentLength(
    workspaceId: string,
    key: string,
    uploadId: string,
    partNumber: number
  ) {
    const record = await this.models.blob.get(workspaceId, key);
    if (!record || record.status === 'completed') {
      throw new BlobInvalid('Multipart upload is not pending');
    }
    if (record.uploadId !== uploadId) {
      throw new BlobInvalid('Upload id mismatch');
    }
    const offset = (partNumber - 1) * MULTIPART_PART_SIZE;
    if (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      offset >= record.size
    ) {
      throw new BlobInvalid('Invalid part number');
    }
    return Math.min(MULTIPART_PART_SIZE, record.size - offset);
  }

  private async reservationId(workspaceId: string, key: string) {
    const record = await this.models.blob.get(workspaceId, key);
    if (
      !record ||
      record.status !== 'pending' ||
      record.deletedAt ||
      !record.reservationId
    ) {
      throw new BlobInvalid('Blob upload is not pending');
    }
    return record.reservationId;
  }

  private reservationObjectKey(
    workspaceId: string,
    key: string,
    reservationId: string
  ) {
    return `${workspaceId}/.reservations/${reservationId}/${key}`;
  }
}
