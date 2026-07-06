import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  type BlobOutputType,
  Config,
  EventBus,
  type GetObjectMetadata,
  OnEvent,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  type PutObjectMetadata,
  type R2StorageConfig,
  SIGNED_URL_EXPIRED,
  type StorageProviderConfig,
  URLHelper,
} from '../../../base';
import { Models } from '../../../models';
import type { StorageProviderCapabilities } from '../../../native';
import { StorageRuntimeProvider } from '../../storage-runtime';

declare global {
  interface Events {
    'workspace.blob.delete': {
      workspaceId: string;
      key: string;
    };
    'workspace.blobs.updated': {
      workspaceId: string;
    };
  }
}

type BlobCompleteResult =
  | { ok: true; metadata: GetObjectMetadata }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'size_mismatch'
        | 'mime_mismatch'
        | 'checksum_mismatch'
        | 'size_too_large';
    };

type BlobGetResult = {
  redirectUrl?: string;
  body?: BlobOutputType;
  metadata?: GetObjectMetadata;
};

type R2ProxyConfig = {
  signKey: string;
  urlPrefix: string;
};

@Injectable()
export class WorkspaceBlobStorage {
  private readonly logger = new Logger(WorkspaceBlobStorage.name);

  constructor(
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly url: URLHelper,
    private readonly rt: StorageRuntimeProvider,
    private readonly config: Config
  ) {}

  async put(workspaceId: string, key: string, blob: Buffer) {
    const metadata = await this.rt.putObject(
      'blob',
      `${workspaceId}/${key}`,
      blob
    );
    await this.upsert(workspaceId, key, {
      contentType: metadata.contentType,
      contentLength: metadata.contentLength,
      lastModified: metadata.lastModified,
    });
  }

  async capabilities(): Promise<StorageProviderCapabilities> {
    const capabilities = await this.rt.providerCapabilities('blob');
    if (!this.r2ProxyConfig()) {
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

  async get(
    workspaceId: string,
    key: string,
    signedUrl?: boolean
  ): Promise<BlobGetResult> {
    if (signedUrl) {
      const presigned = await this.rt.presignGet(
        'blob',
        `${workspaceId}/${key}`
      );
      if (presigned) {
        return { redirectUrl: presigned.url };
      }
    }
    return this.rt.getObject('blob', `${workspaceId}/${key}`);
  }

  async presignPut(
    workspaceId: string,
    key: string,
    metadata?: PutObjectMetadata
  ) {
    const proxy = this.r2ProxyConfig();
    if (proxy) {
      return this.createProxyUploadUrl(workspaceId, key, metadata, proxy);
    }
    return this.rt.presignPut('blob', `${workspaceId}/${key}`, metadata);
  }

  async createMultipartUpload(
    workspaceId: string,
    key: string,
    metadata?: PutObjectMetadata
  ) {
    return this.rt.createMultipartUpload(
      'blob',
      `${workspaceId}/${key}`,
      metadata
    );
  }

  async presignUploadPart(
    workspaceId: string,
    key: string,
    uploadId: string,
    partNumber: number
  ) {
    const proxy = this.r2ProxyConfig();
    if (proxy) {
      return this.createProxyMultipartUrl(
        workspaceId,
        key,
        uploadId,
        partNumber,
        proxy
      );
    }
    return this.rt.presignUploadPart(
      'blob',
      `${workspaceId}/${key}`,
      uploadId,
      partNumber
    );
  }

  async listMultipartUploadParts(
    workspaceId: string,
    key: string,
    uploadId: string
  ) {
    return this.rt.listMultipartUploadParts(
      'blob',
      `${workspaceId}/${key}`,
      uploadId
    );
  }

  async completeMultipartUpload(
    workspaceId: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[]
  ) {
    return await this.rt.completeMultipartUpload(
      'blob',
      `${workspaceId}/${key}`,
      uploadId,
      parts
    );
  }

  async abortMultipartUpload(
    workspaceId: string,
    key: string,
    uploadId: string
  ) {
    return await this.rt.abortMultipartUpload(
      'blob',
      `${workspaceId}/${key}`,
      uploadId
    );
  }

  async head(workspaceId: string, key: string) {
    return this.rt.headObject('blob', `${workspaceId}/${key}`);
  }

  async complete(
    workspaceId: string,
    key: string,
    expected: { size: number; mime: string }
  ): Promise<BlobCompleteResult> {
    const result = await this.rt.completeWorkspaceBlobUpload(
      workspaceId,
      key,
      expected
    );
    if (!result.ok) {
      return {
        ok: false,
        reason: (result.reason ?? 'checksum_mismatch') as Exclude<
          BlobCompleteResult,
          { ok: true }
        >['reason'],
      };
    }
    return {
      ok: true,
      metadata: {
        contentType: result.contentType ?? 'application/octet-stream',
        contentLength: result.contentLength ?? expected.size,
        lastModified: new Date(result.lastModifiedMs ?? Date.now()),
      },
    };
  }

  async list(workspaceId: string) {
    return await this.models.blob.list(workspaceId);
  }

  async delete(workspaceId: string, key: string, permanently = false) {
    if (permanently) {
      await this.rt.deleteObject('blob', `${workspaceId}/${key}`);
    }
    await this.models.blob.delete(workspaceId, key, permanently);
    if (!permanently) {
      await this.event.emitAsync('workspace.blobs.updated', { workspaceId });
    }
  }

  async release(workspaceId: string) {
    let scanned = 0;
    let deleted = 0;
    for (;;) {
      const result = await this.rt.releaseDeletedBlobs(workspaceId, 1000);
      scanned += result.scanned;
      deleted += result.deleted;
      if (result.scanned < 1000) break;
    }

    this.logger.log(
      `released ${deleted}/${scanned} blobs for workspace ${workspaceId}`
    );

    await this.event.emitAsync('workspace.blobs.updated', { workspaceId });
  }

  async totalSize(workspaceId: string) {
    return await this.models.blob.totalSize(workspaceId);
  }

  getAvatarUrl(workspaceId: string, avatarKey: string | null) {
    if (!avatarKey) {
      return undefined;
    }
    return this.url.link(`/api/workspaces/${workspaceId}/blobs/${avatarKey}`);
  }

  private async upsert(
    workspaceId: string,
    key: string,
    meta: GetObjectMetadata
  ) {
    await this.models.blob.upsert({
      workspaceId,
      key,
      mime: meta.contentType,
      size: meta.contentLength,
      status: 'completed',
      uploadId: null,
    });
  }

  @OnEvent('workspace.deleted')
  async onWorkspaceDeleted({ id }: Events['workspace.deleted']) {
    const blobs = await this.list(id);

    // to reduce cpu time holding
    blobs.forEach(blob => {
      this.event.emit('workspace.blob.delete', {
        workspaceId: id,
        key: blob.key,
      });
    });
  }

  @OnEvent('workspace.blob.delete')
  async onDeleteWorkspaceBlob({
    workspaceId,
    key,
  }: Events['workspace.blob.delete']) {
    await this.delete(workspaceId, key, true);
  }

  private r2ProxyConfig() {
    const storage = this.config.storages.blob.storage as StorageProviderConfig;
    if (storage.provider !== 'cloudflare-r2') {
      return;
    }
    const r2 = storage.config as R2StorageConfig;
    const usePresignedURL = r2.usePresignedURL;
    if (
      !usePresignedURL?.enabled ||
      !usePresignedURL.urlPrefix ||
      !usePresignedURL.signKey
    ) {
      return;
    }
    return {
      signKey: usePresignedURL.signKey,
      urlPrefix: usePresignedURL.urlPrefix,
    };
  }

  private signProxy(
    path: string,
    canonicalFields: (string | number | undefined)[],
    exp: number,
    signKey: string
  ) {
    const canonical = [
      path,
      ...canonicalFields.map(field =>
        field === undefined ? '' : field.toString()
      ),
      exp.toString(),
    ].join('\n');
    return `${exp}-${createHmac('sha256', signKey).update(canonical).digest('base64')}`;
  }

  private createProxyUploadUrl(
    workspaceId: string,
    key: string,
    metadata: PutObjectMetadata | undefined,
    proxy: R2ProxyConfig
  ) {
    const contentType = metadata?.contentType ?? 'application/octet-stream';
    const contentLength = metadata?.contentLength;
    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRED * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const token = this.signProxy(
      PROXY_UPLOAD_PATH,
      [workspaceId, key, contentType, contentLength],
      exp,
      proxy.signKey
    );
    return {
      url: this.linkProxyUrl(proxy.urlPrefix, PROXY_UPLOAD_PATH, {
        workspaceId,
        key,
        contentType,
        contentLength,
        exp,
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
    proxy: R2ProxyConfig
  ) {
    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRED * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const token = this.signProxy(
      PROXY_MULTIPART_PATH,
      [workspaceId, key, uploadId, partNumber],
      exp,
      proxy.signKey
    );
    return {
      url: this.linkProxyUrl(proxy.urlPrefix, PROXY_MULTIPART_PATH, {
        workspaceId,
        key,
        uploadId,
        partNumber,
        exp,
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
}
