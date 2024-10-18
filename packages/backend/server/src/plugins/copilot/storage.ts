import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { QuotaManagementService } from '../../core/quota';
import {
  type BlobInputType,
  BlobQuotaExceeded,
  CallMetric,
  Config,
  type FileUpload,
  type StorageProvider,
  StorageProviderFactory,
  URLHelper,
} from '../../fundamentals';

@Injectable()
export class CopilotStorage {
  public readonly provider: StorageProvider;

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly storageFactory: StorageProviderFactory,
    private readonly quota: QuotaManagementService
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
    if (this.config.node.dev) {
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
    const checkExceeded = await this.quota.getQuotaCalculator(userId);

    if (checkExceeded(0)) {
      throw new BlobQuotaExceeded();
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = blob.createReadStream();
      const chunks: Uint8Array[] = [];
      stream.on('data', chunk => {
        chunks.push(chunk);

        // check size after receive each chunk to avoid unnecessary memory usage
        const bufferSize = chunks.reduce((acc, cur) => acc + cur.length, 0);
        if (checkExceeded(bufferSize)) {
          reject(new BlobQuotaExceeded());
        }
      });
      stream.on('error', reject);
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);

        if (checkExceeded(buffer.length)) {
          reject(new BlobQuotaExceeded());
        } else {
          resolve(buffer);
        }
      });
    });

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
