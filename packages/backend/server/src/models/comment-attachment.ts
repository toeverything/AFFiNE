import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { BaseModel } from './base';

export type CreateCommentAttachmentInput =
  Prisma.CommentAttachmentUncheckedCreateInput;

/**
 * Comment Attachment Model
 */
@Injectable()
export class CommentAttachmentModel extends BaseModel {
  async upsert(input: CreateCommentAttachmentInput) {
    const result = await this.db.commentAttachment.upsert({
      where: {
        workspaceId_docId_key: {
          workspaceId: input.workspaceId,
          docId: input.docId,
          key: input.key,
        },
      },
      update: {
        name: input.name,
        mime: input.mime,
        size: input.size,
      },
      create: {
        workspaceId: input.workspaceId,
        docId: input.docId,
        key: input.key,
        name: input.name,
        mime: input.mime,
        size: input.size,
        createdBy: input.createdBy,
      },
    });
    await this.markQuotaStateStale(input.workspaceId);
    return result;
  }

  async delete(workspaceId: string, docId: string, key: string) {
    await this.db.commentAttachment.deleteMany({
      where: {
        workspaceId,
        docId,
        key,
      },
    });
    await this.markQuotaStateStale(workspaceId);
    this.logger.log(`deleted comment attachment ${workspaceId}/${key}`);
  }

  async get(workspaceId: string, docId: string, key: string) {
    return await this.db.commentAttachment.findUnique({
      where: {
        workspaceId_docId_key: {
          workspaceId,
          docId,
          key,
        },
      },
    });
  }

  async list(workspaceId: string, docId?: string) {
    return await this.db.commentAttachment.findMany({
      where: {
        workspaceId,
        docId,
      },
    });
  }

  private async markQuotaStateStale(workspaceId: string) {
    await this.db.effectiveWorkspaceQuotaState.updateMany({
      where: { workspaceId },
      data: { stale: true },
    });
  }
}
