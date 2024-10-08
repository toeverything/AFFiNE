import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { QuotaManagementService } from '../../core/quota';
import {
  type BlobInputType,
  BlobQuotaExceeded,
  Config,
  type FileUpload,
  metrics,
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

  async put(
    userId: string,
    workspaceId: string,
    key: string,
    blob: BlobInputType
  ) {
    metrics.ai.counter('blob_put').add(1);
    const name = `${userId}/${workspaceId}/${key}`;
    await this.provider.put(name, blob);
    if (this.config.node.dev) {
      // return image base64url for dev environment
      return `data:image/png;base64,${blob.toString('base64')}`;
    }
    return this.url.link(`/api/copilot/blob/${name}`);
  }

  async get(userId: string, workspaceId: string, key: string) {
    metrics.ai.counter('blob_get').add(1);
    return this.provider.get(`${userId}/${workspaceId}/${key}`);
  }

  async delete(userId: string, workspaceId: string, key: string) {
    metrics.ai.counter('blob_delete').add(1);
    await this.provider.delete(`${userId}/${workspaceId}/${key}`);
  }

  async handleUpload(userId: string, blob: FileUpload) {
    const checkExceeded = await this.quota.getQuotaCalculator(userId);

    if (checkExceeded(0)) {
      throw new BlobQuotaExceeded();
    }

    try {
      metrics.ai.counter('blob_handle_upload').add(1);
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
    } catch (e) {
      metrics.ai.counter('blob_handle_upload_error').add(1);
      throw e;
    }
  }

  async handleRemoteLink(userId: string, workspaceId: string, link: string) {
    const response = await fetch(link);
    const buffer = new Uint8Array(await response.arrayBuffer());
    const filename = createHash('sha256').update(buffer).digest('base64url');
    metrics.ai.counter('blob_proxy_remote_url').add(1);
    return this.put(userId, workspaceId, filename, Buffer.from(buffer));
  }
}
