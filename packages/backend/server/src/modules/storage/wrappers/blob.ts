import { Readable } from 'node:stream';

import type { Storage } from '@affine/storage';
import { Injectable, OnModuleInit } from '@nestjs/common';

import { Config } from '../../../config';
import { EventEmitter, type EventPayload, OnEvent } from '../../../event';
import { OctoBaseStorageModule } from '../../../storage';
import {
  BlobInputType,
  createStorageProvider,
  StorageProvider,
} from '../providers';
import { toBuffer } from '../providers/utils';

@Injectable()
export class WorkspaceBlobStorage implements OnModuleInit {
  public readonly provider: StorageProvider;

  /**
   * @deprecated for backwards compatibility, need to be removed in next stable release
   */
  private octobase: Storage | null = null;

  constructor(
    private readonly event: EventEmitter,
    private readonly config: Config
  ) {
    this.provider = createStorageProvider(this.config.storage, 'blob');
  }

  async onModuleInit() {
    if (!this.config.node.test) {
      this.octobase = await OctoBaseStorageModule.Storage.connect(
        this.config.db.url
      );
    }
  }

  async put(workspaceId: string, key: string, blob: BlobInputType) {
    const buf = await toBuffer(blob);
    await this.provider.put(`${workspaceId}/${key}`, buf);
    if (this.octobase) {
      await this.octobase.uploadBlob(workspaceId, buf);
    }
  }

  async get(workspaceId: string, key: string) {
    const result = await this.provider.get(`${workspaceId}/${key}`);
    if (!result.body && this.octobase) {
      const blob = await this.octobase.getBlob(workspaceId, key);

      if (!blob) {
        return result;
      }

      return {
        body: Readable.from(blob.data),
        metadata: {
          contentType: blob.contentType,
          contentLength: blob.size,
          lastModified: new Date(blob.lastModified),
        },
      };
    }

    return result;
  }

  async list(workspaceId: string) {
    const blobs = await this.provider.list(workspaceId + '/');

    blobs.forEach(item => {
      // trim workspace prefix
      item.key = item.key.slice(workspaceId.length + 1);
    });

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
