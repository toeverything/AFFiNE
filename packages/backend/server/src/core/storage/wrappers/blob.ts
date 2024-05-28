import { Injectable } from '@nestjs/common';

import {
  type BlobInputType,
  Cache,
  Config,
  EventEmitter,
  type EventPayload,
  type ListObjectsMetadata,
  OnEvent,
  type StorageProvider,
  StorageProviderFactory,
} from '../../../fundamentals';

@Injectable()
export class WorkspaceBlobStorage {
  public readonly provider: StorageProvider;

  constructor(
    private readonly config: Config,
    private readonly event: EventEmitter,
    private readonly storageFactory: StorageProviderFactory,
    private readonly cache: Cache
  ) {
    this.provider = this.storageFactory.create(this.config.storages.blob);
  }

  async put(workspaceId: string, key: string, blob: BlobInputType) {
    await this.provider.put(`${workspaceId}/${key}`, blob);
    await this.cache.delete(`blob-list:${workspaceId}`);
  }

  async get(workspaceId: string, key: string) {
    return this.provider.get(`${workspaceId}/${key}`);
  }

  async list(workspaceId: string) {
    const cachedList = await this.cache.list<ListObjectsMetadata>(
      `blob-list:${workspaceId}`,
      0,
      -1
    );

    if (cachedList.length > 0) {
      return cachedList;
    }

    const blobs = await this.provider.list(workspaceId + '/');

    blobs.forEach(item => {
      // trim workspace prefix
      item.key = item.key.slice(workspaceId.length + 1);
    });

    await this.cache.pushBack(`blob-list:${workspaceId}`, ...blobs);

    return blobs;
  }

  /**
   * we won't really delete the blobs until the doc blobs manager is implemented sounded
   */
  async delete(_workspaceId: string, _key: string) {
    // return this.provider.delete(`${workspaceId}/${key}`);
  }

  async totalSize(workspaceId: string) {
    const blobs = await this.list(workspaceId);
    // how could we ignore the ones get soft-deleted?
    return blobs.reduce((acc, item) => acc + item.size, 0);
  }

  @OnEvent('workspace.deleted')
  async onWorkspaceDeleted(workspaceId: EventPayload<'workspace.deleted'>) {
    const blobs = await this.list(workspaceId);

    // to reduce cpu time holding
    blobs.forEach(blob => {
      this.event.emit('workspace.blob.deleted', {
        workspaceId: workspaceId,
        name: blob.key,
      });
    });
  }

  @OnEvent('workspace.blob.deleted')
  async onDeleteWorkspaceBlob({
    workspaceId,
    name,
  }: EventPayload<'workspace.blob.deleted'>) {
    await this.delete(workspaceId, name);
  }
}
