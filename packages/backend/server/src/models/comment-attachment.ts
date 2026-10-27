import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

/**
 * Comment Attachment Model
 */
@Injectable()
export class CommentAttachmentModel extends BaseModel {
  async get(workspaceId: string, docId: string, key: string) {
    const attachment = await this.db.commentAttachment.findUnique({
      where: {
        workspaceId_docId_key: {
          workspaceId,
          docId,
          key,
        },
      },
    });
    return attachment?.status === 'completed' && attachment.deletedAt === null
      ? attachment
      : null;
  }

  async list(workspaceId: string, docId?: string) {
    return await this.db.commentAttachment.findMany({
      where: {
        workspaceId,
        docId,
        status: 'completed',
        deletedAt: null,
      },
    });
  }
}
