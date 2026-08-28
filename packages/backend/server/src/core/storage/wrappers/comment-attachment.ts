import { Injectable, Logger } from '@nestjs/common';

import { EventBus, metrics, OnEvent, URLHelper } from '../../../base';
import { Models } from '../../../models';
import {
  type StorageRuntimeGetObjectResult,
  StorageRuntimeProvider,
} from '../../storage-runtime';

declare global {
  interface Events {
    'comment.attachment.delete': {
      workspaceId: string;
      docId: string;
      key: string;
    };
  }
}

@Injectable()
export class CommentAttachmentStorage {
  private readonly logger = new Logger(CommentAttachmentStorage.name);

  constructor(
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly url: URLHelper,
    private readonly rt: StorageRuntimeProvider
  ) {}

  private storageKey(workspaceId: string, docId: string, key: string) {
    return `comment-attachments/${workspaceId}/${docId}/${key}`;
  }

  async put(
    workspaceId: string,
    docId: string,
    key: string,
    name: string,
    blob: Buffer,
    userId: string
  ) {
    const metadata = await this.rt.putObject(
      'blob',
      this.storageKey(workspaceId, docId, key),
      blob
    );
    const mime = metadata.contentType;
    const size = metadata.contentLength;
    await this.models.commentAttachment.upsert({
      workspaceId,
      docId,
      key,
      name,
      mime,
      size,
      createdBy: userId,
    });

    metrics.storage.histogram('comment_attachment_size').record(size, { mime });
    metrics.storage.counter('comment_attachment_total').add(1, { mime });
    this.logger.log(
      `uploaded comment attachment ${workspaceId}/${docId}/${key} with size ${size}, mime: ${mime}, name: ${name}, user: ${userId}`
    );
  }

  async get(
    workspaceId: string,
    docId: string,
    key: string,
    signedUrl?: boolean
  ): Promise<StorageRuntimeGetObjectResult> {
    const storageKey = this.storageKey(workspaceId, docId, key);
    if (signedUrl) {
      const presigned = await this.rt.presignGet('blob', storageKey);
      if (presigned) {
        return { redirectUrl: presigned.url };
      }
    }
    return await this.rt.getObject('blob', storageKey);
  }

  async delete(workspaceId: string, docId: string, key: string) {
    await this.rt.deleteObject(
      'blob',
      this.storageKey(workspaceId, docId, key)
    );
    await this.models.commentAttachment.delete(workspaceId, docId, key);
    this.logger.log(
      `deleted comment attachment ${workspaceId}/${docId}/${key}`
    );
  }

  getUrl(workspaceId: string, docId: string, key: string) {
    return this.url.link(
      `/api/workspaces/${workspaceId}/docs/${docId}/comment-attachments/${key}`
    );
  }

  @OnEvent('workspace.deleted')
  async onWorkspaceDeleted({ id }: Events['workspace.deleted']) {
    const attachments = await this.models.commentAttachment.list(id);

    for (const attachment of attachments) {
      this.event.emit('comment.attachment.delete', {
        workspaceId: id,
        docId: attachment.docId,
        key: attachment.key,
      });
    }
  }

  @OnEvent('comment.attachment.delete')
  async onCommentAttachmentDelete({
    workspaceId,
    docId,
    key,
  }: Events['comment.attachment.delete']) {
    await this.delete(workspaceId, docId, key);
  }
}
