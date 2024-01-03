import { Injectable } from '@nestjs/common';

import { Config } from '../../../config';
import { EventEmitter, type EventPayload, OnEvent } from '../../../event';
import {
  BlobInputType,
  createStorageProvider,
  StorageProvider,
} from '../providers';

@Injectable()
export class WorkspaceBlobStorage {
  public readonly provider: StorageProvider;
  constructor(
    private readonly event: EventEmitter,
    { storage }: Config
  ) {
    this.provider = createStorageProvider(storage, 'blob');
  }

  put(workspaceId: string, key: string, blob: BlobInputType) {
    return this.provider.put(`${workspaceId}/${key}`, blob);
  }

  get(workspaceId: string, key: string) {
    return this.provider.get(`${workspaceId}/${key}`);
  }

  async list(workspaceId: string) {
    const blobs = await this.provider.list(workspaceId + '/');

    blobs.forEach(item => {
      // trim workspace prefix
      item.key = item.key.slice(workspaceId.length + 1);
    });

    return blobs;
  }

  async delete(workspaceId: string, key: string) {
    return this.provider.delete(`${workspaceId}/${key}`);
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
