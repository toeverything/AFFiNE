import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  type BlobInputType,
  BlobQuotaExceeded,
  CallMetric,
  Config,
  type FileUpload,
  readBuffer,
  type StorageProvider,
  StorageProviderFactory,
  URLHelper,
} from '../../base';
import { QuotaService } from '../../core/quota';

@Injectable()
export class CopilotStorage {
  public readonly provider: StorageProvider;

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly storageFactory: StorageProviderFactory,
    private readonly quota: QuotaService
  ) {
    this.provider = this.storageFactory.create(
      this.config.plugins.copilot.storage
    );
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
    if (this.config.node.dev || this.config.node.test) {
      // return image base64url for dev environment
      return `data:image/png;base64,${blob.toString('base64')}`;
    }
    return this.url.link(`/api/copilot/blob/${name}`);
  }

  @CallMetric('ai', 'blob_get')
  async get(userId: string, workspaceId: string, key: string) {
    return this.provider.get(`${userId}/${workspaceId}/${key}`);
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
