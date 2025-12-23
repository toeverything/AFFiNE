import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import {
  autoMetadata,
  Config,
  EventBus,
  type GetObjectMetadata,
  ListObjectsMetadata,
  OnEvent,
  PutObjectMetadata,
  type StorageProvider,
  StorageProviderFactory,
  URLHelper,
} from '../../../base';
import { Models } from '../../../models';

declare global {
  interface Events {
    'workspace.blob.sync': {
      workspaceId: string;
      key: string;
    };
    'workspace.blob.delete': {
      workspaceId: string;
      key: string;
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
        | 'checksum_mismatch';
    };

@Injectable()
export class WorkspaceBlobStorage {
  private readonly logger = new Logger(WorkspaceBlobStorage.name);
  private provider!: StorageProvider;

  get config() {
    return this.AFFiNEConfig.storages.blob;
  }

  constructor(
    private readonly AFFiNEConfig: Config,
    private readonly event: EventBus,
    private readonly storageFactory: StorageProviderFactory,
    private readonly models: Models,
    private readonly url: URLHelper
  ) {}

  @OnEvent('config.init')
  async onConfigInit() {
    this.provider = this.storageFactory.create(this.config.storage);
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if (event.updates.storages?.blob?.storage) {
      this.provider = this.storageFactory.create(this.config.storage);
    }
  }

  async put(workspaceId: string, key: string, blob: Buffer) {
    const meta: PutObjectMetadata = autoMetadata(blob);

    await this.provider.put(`${workspaceId}/${key}`, blob, meta);
    await this.upsert(workspaceId, key, {
      contentType: meta.contentType ?? 'application/octet-stream',
      contentLength: blob.length,
      lastModified: new Date(),
    });
  }

  async get(workspaceId: string, key: string, signedUrl?: boolean) {
    return this.provider.get(`${workspaceId}/${key}`, signedUrl);
  }

  async presignPut(
    workspaceId: string,
    key: string,
    metadata?: PutObjectMetadata
  ) {
    return this.provider.presignPut?.(`${workspaceId}/${key}`, metadata);
  }

  async createMultipartUpload(
    workspaceId: string,
    key: string,
    metadata?: PutObjectMetadata
  ) {
    return this.provider.createMultipartUpload?.(
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
    return this.provider.presignUploadPart?.(
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
    return this.provider.listMultipartUploadParts?.(
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
    if (!this.provider.completeMultipartUpload) {
      return false;
    }

    await this.provider.completeMultipartUpload(
      `${workspaceId}/${key}`,
      uploadId,
      parts
    );
    return true;
  }

  async abortMultipartUpload(
    workspaceId: string,
    key: string,
    uploadId: string
  ) {
    if (!this.provider.abortMultipartUpload) {
      return false;
    }

    await this.provider.abortMultipartUpload(`${workspaceId}/${key}`, uploadId);
    return true;
  }

  async head(workspaceId: string, key: string) {
    return this.provider.head(`${workspaceId}/${key}`);
  }

  async complete(
    workspaceId: string,
    key: string,
    expected: { size: number; mime: string }
  ): Promise<BlobCompleteResult> {
    const metadata = await this.head(workspaceId, key);
    if (!metadata) {
      return { ok: false, reason: 'not_found' };
    }

    if (metadata.contentLength !== expected.size) {
      return { ok: false, reason: 'size_mismatch' };
    }

    if (expected.mime && metadata.contentType !== expected.mime) {
      return { ok: false, reason: 'mime_mismatch' };
    }

    const object = await this.provider.get(`${workspaceId}/${key}`);
    if (!object.body) {
      return { ok: false, reason: 'not_found' };
    }

    const checksum = createHash('sha256');
    try {
      for await (const chunk of object.body) {
        checksum.update(chunk as Buffer);
      }
    } catch (e) {
      this.logger.error('failed to read blob for checksum verification', e);
      return { ok: false, reason: 'checksum_mismatch' };
    }

    const base64 = checksum.digest('base64');
    const base64urlWithPadding = base64.replace(/\+/g, '-').replace(/\//g, '_');

    if (base64urlWithPadding !== key) {
      try {
        await this.provider.delete(`${workspaceId}/${key}`);
      } catch (e) {
        // never throw
        this.logger.error('failed to delete invalid blob', e);
      }
      return { ok: false, reason: 'checksum_mismatch' };
    }

    await this.models.blob.upsert({
      workspaceId,
      key,
      mime: metadata.contentType,
      size: metadata.contentLength,
      status: 'completed',
      uploadId: null,
    });

    return { ok: true, metadata };
  }

  async list(workspaceId: string, syncBlobMeta = true) {
    const blobsInDb = await this.models.blob.list(workspaceId);

    if (blobsInDb.length > 0) {
      return blobsInDb;
    }

    // all blobs are uploading but not completed yet
    const hasDbBlobs = await this.models.blob.hasAny(workspaceId);
    if (hasDbBlobs) {
      return blobsInDb;
    }

    const blobs = await this.provider.list(workspaceId + '/');
    blobs.forEach(blob => {
      blob.key = blob.key.slice(workspaceId.length + 1);
    });

    if (syncBlobMeta) {
      this.trySyncBlobsMeta(workspaceId, blobs);
    }

    return blobs.map(blob => ({
      key: blob.key,
      size: blob.contentLength,
      createdAt: blob.lastModified,
      mime: 'application/octet-stream',
    }));
  }

  async delete(workspaceId: string, key: string, permanently = false) {
    if (permanently) {
      await this.provider.delete(`${workspaceId}/${key}`);
    }
    await this.models.blob.delete(workspaceId, key, permanently);
  }

  async release(workspaceId: string) {
    const deletedBlobs = await this.models.blob.listDeleted(workspaceId);

    deletedBlobs.forEach(blob => {
      this.event.emit('workspace.blob.delete', {
        workspaceId: workspaceId,
        key: blob.key,
      });
    });

    this.logger.log(
      `released ${deletedBlobs.length} blobs for workspace ${workspaceId}`
    );
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

  private trySyncBlobsMeta(workspaceId: string, blobs: ListObjectsMetadata[]) {
    for (const blob of blobs) {
      this.event.emit('workspace.blob.sync', {
        workspaceId,
        key: blob.key,
      });
    }
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

  @OnEvent('workspace.blob.sync')
  async syncBlobMeta({ workspaceId, key }: Events['workspace.blob.sync']) {
    try {
      const meta = await this.provider.head(`${workspaceId}/${key}`);

      if (meta) {
        await this.upsert(workspaceId, key, meta);
      } else {
        await this.models.blob.delete(workspaceId, key, true);
      }
    } catch (e) {
      // never throw
      this.logger.error('failed to sync blob meta to DB', e);
    }
  }

  @OnEvent('workspace.deleted')
  async onWorkspaceDeleted({ id }: Events['workspace.deleted']) {
    // do not sync blob meta to DB
    const blobs = await this.list(id, false);

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
}
