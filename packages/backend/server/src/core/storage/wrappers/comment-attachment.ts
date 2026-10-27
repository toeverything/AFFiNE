import { Injectable, Logger } from '@nestjs/common';

import {
  CommentAttachmentQuotaExceeded,
  metrics,
  URLHelper,
} from '../../../base';
import { Models } from '../../../models';
import { getMime } from '../../../native';
import { BackendRuntimeProvider } from '../../backend-runtime';
import {
  type StorageRuntimeGetObjectResult,
  StorageRuntimeProvider,
} from '../../storage-runtime';

@Injectable()
export class CommentAttachmentStorage {
  private readonly logger = new Logger(CommentAttachmentStorage.name);

  constructor(
    private readonly url: URLHelper,
    private readonly rt: StorageRuntimeProvider,
    private readonly runtime: BackendRuntimeProvider,
    private readonly models: Models
  ) {}

  private storageKey(workspaceId: string, docId: string, key: string) {
    return `comment-attachments/${workspaceId}/${docId}/${key}`;
  }

  private reservationStorageKey(
    workspaceId: string,
    docId: string,
    key: string,
    reservationId: string
  ) {
    return `comment-attachments/${workspaceId}/${docId}/.reservations/${reservationId}/${key}`;
  }

  async put(
    workspaceId: string,
    docId: string,
    key: string,
    name: string,
    blob: Buffer,
    userId: string
  ) {
    const reservation = await this.runtime.reserveStorageQuotaV1({
      workspaceId,
      userId,
      key,
      size: blob.byteLength,
      mime: getMime(blob),
      kind: 'comment_attachment',
      docId,
      name,
    });
    if (!reservation.allowed) throw new CommentAttachmentQuotaExceeded();
    if (reservation.alreadyUploaded) return;
    if (!reservation.reservationId)
      throw new Error('Missing comment attachment reservation');
    const reservationKey = this.reservationStorageKey(
      workspaceId,
      docId,
      key,
      reservation.reservationId
    );
    let metadata;
    try {
      metadata = await this.rt.putObject('blob', reservationKey, blob);
      const finalized = await this.runtime.finalizeStorageReservationV1({
        workspaceId,
        userId,
        docId,
        key,
        reservationId: reservation.reservationId,
        kind: 'comment_attachment',
        mime: metadata.contentType,
        size: metadata.contentLength,
      });
      if (!finalized) throw new Error('Comment attachment reservation changed');
    } catch (error) {
      await this.runtime
        .abortStorageReservationV1({
          workspaceId,
          userId,
          key,
          reservationId: reservation.reservationId,
          kind: 'comment_attachment',
          docId,
        })
        .catch(cleanupError => {
          this.logger.warn(
            'Failed to clean up comment attachment upload',
            cleanupError
          );
        });
      throw error;
    }
    const mime = metadata.contentType;
    const size = metadata.contentLength;

    metrics.storage.histogram('comment_attachment_size').record(size, { mime });
    metrics.storage.counter('comment_attachment_total').add(1, { mime });
    this.logger.log(
      `uploaded comment attachment ${workspaceId}/${docId}/${key} with size ${size}, mime: ${mime}, name: ${name}, user: ${userId}`
    );
  }

  async get(source: {
    workspaceId: string;
    docId: string;
    key: string;
  }): Promise<StorageRuntimeGetObjectResult> {
    const { workspaceId, docId, key } = source;
    if (!(await this.models.commentAttachment.get(workspaceId, docId, key))) {
      return {};
    }
    const storageKey = this.storageKey(workspaceId, docId, key);
    return await this.rt.getObject('blob', storageKey);
  }

  getUrl(workspaceId: string, docId: string, key: string) {
    return this.url.link(
      `/api/workspaces/${workspaceId}/docs/${docId}/comment-attachments/${key}`
    );
  }
}
