import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  type BlobInputType,
  BlobQuotaExceeded,
  CallMetric,
  Config,
  type FileUpload,
  OnEvent,
  readBuffer,
  type StorageProvider,
  StorageProviderFactory,
  URLHelper,
} from '../../base';
import { QuotaService } from '../../core/quota';

@Injectable()
export class CopilotStorage {
  public provider!: StorageProvider;

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly storageFactory: StorageProviderFactory,
    private readonly quota: QuotaService
  ) {}

  @OnEvent('config.init')
  async onConfigInit() {
    this.provider = this.storageFactory.create(this.config.copilot.storage);
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if (event.updates?.copilot?.storage) {
      this.provider = this.storageFactory.create(this.config.copilot.storage);
    }
  }

  @CallMetric('ai', 'blob_put')
  async put(
    userId: string,
    workspaceId: string,
    key: string,
    blob: BlobInputType
  ) {
    const name = `${userId}/${workspaceId}/${key}`;
    await this.provider.put(name, blob);
    if (!env.prod) {
      // return image base64url for dev environment
      return `data:image/png;base64,${blob.toString('base64')}`;
    }
    return this.url.link(`/api/copilot/blob/${name}`);
  }

  @CallMetric('ai', 'blob_get')
  async get(
    userId: string,
    workspaceId: string,
    key: string,
    signedUrl?: boolean
  ) {
    return this.provider.get(`${userId}/${workspaceId}/${key}`, signedUrl);
  }

  @CallMetric('ai', 'blob_delete')
  async delete(userId: string, workspaceId: string, key: string) {
    await this.provider.delete(`${userId}/${workspaceId}/${key}`);
  }

  @CallMetric('ai', 'blob_upload')
  async handleUpload(userId: string, blob: FileUpload) {
    const checkExceeded = await this.quota.getUserQuotaCalculator(userId);

    if (checkExceeded(0)) {
      throw new BlobQuotaExceeded();
    }

    const buffer = await readBuffer(blob.createReadStream(), checkExceeded);

    return {
      buffer,
      filename: blob.filename,
    };
  }

  @CallMetric('ai', 'blob_proxy_remote_url')
  async handleRemoteLink(userId: string, workspaceId: string, link: string) {
    const response = await fetch(link);
    const buffer = new Uint8Array(await response.arrayBuffer());
    const filename = createHash('sha256').update(buffer).digest('base64url');
    return this.put(userId, workspaceId, filename, Buffer.from(buffer));
  }
}
