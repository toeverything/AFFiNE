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

  async list(workspaceId: string, syncBlobMeta = true) {
    const blobsInDb = await this.models.blob.list(workspaceId);

    if (blobsInDb.length > 0) {
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
