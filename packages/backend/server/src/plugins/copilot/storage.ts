import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  type BlobInputType,
  BlobQuotaExceeded,
  CallMetric,
  type FileUpload,
  OneMB,
  readBuffer,
  toBuffer,
  URLHelper,
} from '../../base';
import { QuotaService } from '../../core/quota';
import {
  type StorageRuntimeGetObjectResult,
  StorageRuntimeProvider,
} from '../../core/storage-runtime';
import { fetchRemoteAttachment } from '../../native';

const REMOTE_BLOB_MAX_BYTES = 20 * OneMB;

@Injectable()
export class CopilotStorage {
  constructor(
    private readonly url: URLHelper,
    private readonly rt: StorageRuntimeProvider,
    private readonly quota: QuotaService
  ) {}

  @CallMetric('ai', 'blob_put')
  async put(
    userId: string,
    workspaceId: string,
    key: string,
    blob: BlobInputType,
    mimeType = 'image/png'
  ) {
    const name = `${userId}/${workspaceId}/${key}`;
    const buffer = await toBuffer(blob);
    await this.rt.putObject('copilot', name, buffer, {
      contentType: mimeType,
      contentLength: buffer.length,
    });
    if (!env.prod) {
      // return image base64url for dev environment
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    return this.url.link(`/api/copilot/blob/${name}`);
  }

  @CallMetric('ai', 'blob_get')
  async get(
    userId: string,
    workspaceId: string,
    key: string,
    signedUrl?: boolean
  ): Promise<StorageRuntimeGetObjectResult> {
    const name = `${userId}/${workspaceId}/${key}`;
    if (signedUrl) {
      const presigned = await this.rt.presignGet('copilot', name);
      if (presigned) {
        return { redirectUrl: presigned.url };
      }
    }
    return this.rt.getObject('copilot', name);
  }

  @CallMetric('ai', 'blob_delete')
  async delete(userId: string, workspaceId: string, key: string) {
    await this.rt.deleteObject('copilot', `${userId}/${workspaceId}/${key}`);
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
    const { body, mimeType } = await fetchRemoteAttachment({
      url: link,
      maxBytes: REMOTE_BLOB_MAX_BYTES,
      expectedContentTypePrefix: 'image/',
      maxImageHeight: 4096,
      maxImageWidth: 4096,
    });
    const buffer = Buffer.from(body);
    const filename = createHash('sha256').update(buffer).digest('base64url');
    return this.put(userId, workspaceId, filename, buffer, mimeType);
  }
}
