import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  BadRequest,
  type BlobInputType,
  BlobQuotaExceeded,
  CallMetric,
  type FileUpload,
  OneMB,
  readBufferWithLimit,
  toBuffer,
} from '../../base';
import { StorageRuntimeProvider } from '../../core/storage-runtime';
import { fetchRemoteAttachment } from '../../native';

const COPILOT_BLOB_MAX_BYTES = 20 * OneMB;

@Injectable()
export class CopilotStorage {
  constructor(private readonly rt: StorageRuntimeProvider) {}

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
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    try {
      const signedUrl = await this.presignGet(userId, workspaceId, key);
      if (!signedUrl) {
        throw new Error('Copilot blob signing is required');
      }
      return signedUrl;
    } catch (error) {
      await this.rt.deleteObject('copilot', name);
      throw error;
    }
  }

  @CallMetric('ai', 'session_attachment_put')
  async putSessionAttachment(
    userId: string,
    workspaceId: string,
    key: string,
    buffer: Buffer,
    mimeType: string
  ) {
    await this.rt.putObject(
      'copilot',
      `${userId}/${workspaceId}/${key}`,
      buffer,
      {
        contentType: mimeType,
        contentLength: buffer.length,
      }
    );
  }

  @CallMetric('ai', 'session_attachment_get')
  async getSessionAttachment(userId: string, workspaceId: string, key: string) {
    return await this.rt.getObject(
      'copilot',
      `${userId}/${workspaceId}/${key}`
    );
  }

  sessionAttachmentUrl(
    sessionId: string,
    workspaceId: string,
    key: string,
    fileName?: string
  ) {
    const query = new URLSearchParams({ workspaceId });
    if (fileName) query.set('fileName', fileName);
    return `/api/copilot/chat/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(key)}?${query}`;
  }

  sessionAttachmentFromUrl(
    url: string,
    context: { sessionId?: string; workspaceId: string }
  ) {
    let parsed: URL;
    try {
      parsed = new URL(url, 'http://copilot.local');
    } catch {
      return;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments[0] !== 'api' ||
      segments[1] !== 'copilot' ||
      segments[2] !== 'chat'
    ) {
      return;
    }
    if (
      segments.length !== 6 ||
      segments[4] !== 'attachments' ||
      !context.sessionId
    ) {
      throw new BadRequest('Invalid Copilot attachment locator');
    }
    const sessionId = decodeURIComponent(segments[3]);
    const key = decodeURIComponent(segments[5]);
    const workspaceId = parsed.searchParams.get('workspaceId');
    if (
      sessionId !== context.sessionId ||
      workspaceId !== context.workspaceId ||
      !key ||
      key.includes('/') ||
      key.includes('\\')
    ) {
      throw new BadRequest('Copilot attachment scope mismatch');
    }
    return {
      key,
      fileName: parsed.searchParams.get('fileName') || undefined,
    };
  }

  async presignGet(userId: string, workspaceId: string, key: string) {
    return (
      await this.rt.presignGet('copilot', `${userId}/${workspaceId}/${key}`)
    )?.url;
  }

  keyFromUrl(userId: string, workspaceId: string, url: string) {
    try {
      const parsed = new URL(url);
      const prefix = `/api/copilot/blob/${encodeURIComponent(userId)}/${encodeURIComponent(workspaceId)}/`;
      if (parsed.pathname.startsWith(prefix)) {
        return decodeURIComponent(parsed.pathname.slice(prefix.length));
      }
    } catch {
      return;
    }
    return undefined;
  }

  @CallMetric('ai', 'blob_delete')
  async delete(userId: string, workspaceId: string, key: string) {
    await this.rt.deleteObject('copilot', `${userId}/${workspaceId}/${key}`);
  }

  @CallMetric('ai', 'blob_upload')
  async handleUpload(blob: FileUpload) {
    const buffer = await readBufferWithLimit(
      blob.createReadStream(),
      COPILOT_BLOB_MAX_BYTES
    );

    return {
      buffer,
      filename: blob.filename,
    };
  }

  async handleUploadBuffer(buffer: Buffer) {
    if (buffer.length > COPILOT_BLOB_MAX_BYTES) {
      throw new BlobQuotaExceeded();
    }
    return buffer;
  }

  @CallMetric('ai', 'blob_proxy_remote_url')
  async handleRemoteLink(userId: string, workspaceId: string, link: string) {
    const { body, mimeType } = await fetchRemoteAttachment({
      url: link,
      maxBytes: COPILOT_BLOB_MAX_BYTES,
      expectedContentTypePrefix: 'image/',
      maxImageHeight: 4096,
      maxImageWidth: 4096,
    });
    const buffer = Buffer.from(body);
    const filename = createHash('sha256').update(buffer).digest('base64url');
    return this.put(userId, workspaceId, filename, buffer, mimeType);
  }
}
