import { Injectable, Logger } from '@nestjs/common';

import {
  autoMetadata,
  Config,
  EventBus,
  metrics,
  OnEvent,
  type StorageProvider,
  StorageProviderFactory,
  URLHelper,
} from '../../../base';
import { Models } from '../../../models';

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
  private provider!: StorageProvider;

  get config() {
    return this.AFFiNEConfig.storages.blob;
  }

  constructor(
    private readonly AFFiNEConfig: Config,
    private readonly event: EventBus,
    private readonly storageFactory: StorageProviderFactory,
    private readonly models: Models,
    private readonly url: URLHelper
  ) {}

  @OnEvent('config.init')
  async onConfigInit() {
    this.provider = this.storageFactory.create(this.config.storage);
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if (event.updates.storages?.blob?.storage) {
      this.provider = this.storageFactory.create(this.config.storage);
    }
  }

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
    const meta = autoMetadata(blob);

    await this.provider.put(
      this.storageKey(workspaceId, docId, key),
      blob,
      meta
    );
    const mime = meta.contentType ?? 'application/octet-stream';
    const size = blob.length;
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
  ) {
    return await this.provider.get(
      this.storageKey(workspaceId, docId, key),
      signedUrl
    );
  }

  async delete(workspaceId: string, docId: string, key: string) {
    await this.provider.delete(this.storageKey(workspaceId, docId, key));
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
