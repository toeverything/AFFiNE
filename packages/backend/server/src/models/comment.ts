import { Injectable } from '@nestjs/common';
import { Comment as CommentType, Reply as ReplyType } from '@prisma/client';
import { z } from 'zod';

import { CommentNotFound } from '../base';
import { BaseModel } from './base';

export interface Comment extends CommentType {
  content: Record<string, any>;
}

export interface Reply extends ReplyType {
  content: Record<string, any>;
}

// TODO(@fengmk2): move IdSchema to common/base.ts
const IdSchema = z.string().trim().min(1).max(100);
const JSONSchema = z.record(z.any());

export const CommentCreateSchema = z.object({
  workspaceId: IdSchema,
  docId: IdSchema,
  userId: IdSchema,
  content: JSONSchema,
});

export const CommentUpdateSchema = z.object({
  id: IdSchema,
  content: JSONSchema,
});

export const CommentResolveSchema = z.object({
  id: IdSchema,
  resolved: z.boolean(),
});

export const ReplyCreateSchema = z.object({
  commentId: IdSchema,
  userId: IdSchema,
  content: JSONSchema,
});

export const ReplyUpdateSchema = z.object({
  id: IdSchema,
  content: JSONSchema,
});

export type CommentCreate = z.input<typeof CommentCreateSchema>;
export type CommentUpdate = z.input<typeof CommentUpdateSchema>;
export type CommentResolve = z.input<typeof CommentResolveSchema>;
export type ReplyCreate = z.input<typeof ReplyCreateSchema>;
export type ReplyUpdate = z.input<typeof ReplyUpdateSchema>;

export interface CommentWithReplies extends Comment {
  replies: Reply[];
}

export enum CommentChangeAction {
  update = 'update',
  delete = 'delete',
}

export interface DeletedChangeItem {
  deletedAt: Date;
  updatedAt: Date;
}

export interface CommentChange {
  action: CommentChangeAction;
  id: string;
  commentId?: string;
  item: Comment | Reply | DeletedChangeItem;
}

@Injectable()
export class CommentModel extends BaseModel {
  // #region Comment

  /**
   * Create a comment
   * @param input - The comment create input
   * @returns The created comment
   */
  async create(input: CommentCreate) {
    const data = CommentCreateSchema.parse(input);
    return (await this.db.comment.create({
      data,
    })) as Comment;
  }

  async get(id: string) {
    return (await this.db.comment.findUnique({
      where: { id, deletedAt: null },
    })) as Comment | null;
  }

  /**
   * Update a comment content
   * @param input - The comment update input
   * @returns The updated comment
   */
  async update(input: CommentUpdate) {
    const data = CommentUpdateSchema.parse(input);
    return await this.db.comment.update({
      where: { id: data.id, deletedAt: null },
      data: {
        content: data.content,
      },
    });
  }

  /**
   * Delete a comment or reply
   * @param id - The id of the comment or reply
   * @returns The deleted comment or reply
   */
  async delete(id: string) {
    await this.db.comment.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    this.logger.log(`Comment ${id} deleted`);
  }

  /**
   * Resolve a comment or not
   * @param input - The comment resolve input
   * @returns The resolved comment
   */
  async resolve(input: CommentResolve) {
    const data = CommentResolveSchema.parse(input);
    return await this.db.comment.update({
      where: { id: data.id, deletedAt: null },
      data: { resolved: data.resolved },
    });
  }

  async count(workspaceId: string, docId: string) {
    return await this.db.comment.count({
      where: { workspaceId, docId, deletedAt: null },
    });
  }

  /**
   * List comments ordered by sid descending
   * @param workspaceId - The workspace id
   * @param docId - The doc id
   * @param options - The options
   * @returns The list of comments with replies
   */
  async list(
    workspaceId: string,
    docId: string,
    options?: {
      sid?: number;
      take?: number;
    }
  ): Promise<CommentWithReplies[]> {
    const comments = (await this.db.comment.findMany({
      where: {
        workspaceId,
        docId,
        ...(options?.sid ? { sid: { lt: options.sid } } : {}),
        deletedAt: null,
      },
      orderBy: { sid: 'desc' },
      take: options?.take ?? 100,
    })) as Comment[];

    const replies = (await this.db.reply.findMany({
      where: {
        commentId: { in: comments.map(comment => comment.id) },
        deletedAt: null,
      },
      orderBy: { sid: 'asc' },
    })) as Reply[];

    const replyMap = new Map<string, Reply[]>();
    for (const reply of replies) {
      const items = replyMap.get(reply.commentId) ?? [];
      items.push(reply);
      replyMap.set(reply.commentId, items);
    }

    const commentWithReplies = comments.map(comment => ({
      ...comment,
      replies: replyMap.get(comment.id) ?? [],
    }));

    return commentWithReplies;
  }

  async listChanges(
    workspaceId: string,
    docId: string,
    options?: {
      commentUpdatedAt?: Date;
      replyUpdatedAt?: Date;
      take?: number;
    }
  ): Promise<CommentChange[]> {
    const take = options?.take ?? 10000;
    const comments = (await this.db.comment.findMany({
      where: {
        workspaceId,
        docId,
        ...(options?.commentUpdatedAt
          ? { updatedAt: { gt: options.commentUpdatedAt } }
          : {}),
      },
      take,
      orderBy: { updatedAt: 'asc' },
    })) as Comment[];

    const replies = (await this.db.reply.findMany({
      where: {
        workspaceId,
        docId,
        ...(options?.replyUpdatedAt
          ? { updatedAt: { gt: options.replyUpdatedAt } }
          : {}),
      },
      take,
      orderBy: { updatedAt: 'asc' },
    })) as Reply[];

    const changes: CommentChange[] = [];
    for (const comment of comments) {
      if (comment.deletedAt) {
        changes.push({
          action: CommentChangeAction.delete,
          id: comment.id,
          item: {
            deletedAt: comment.deletedAt,
            updatedAt: comment.updatedAt,
          },
        });
      } else {
        changes.push({
          action: CommentChangeAction.update,
          id: comment.id,
          item: comment,
        });
      }
    }

    for (const reply of replies) {
      if (reply.deletedAt) {
        changes.push({
          action: CommentChangeAction.delete,
          id: reply.id,
          commentId: reply.commentId,
          item: {
            deletedAt: reply.deletedAt,
            updatedAt: reply.updatedAt,
          },
        });
      } else {
        changes.push({
          action: CommentChangeAction.update,
          id: reply.id,
          commentId: reply.commentId,
          item: reply,
        });
      }
    }

    return changes;
  }

  // #endregion

  // #region Reply

  /**
   * Reply to a comment
   * @param input - The reply create input
   * @returns The created reply
   */
  async createReply(input: ReplyCreate) {
    const data = ReplyCreateSchema.parse(input);
    // find comment
    const comment = await this.get(data.commentId);
    if (!comment) {
      throw new CommentNotFound();
    }

    return (await this.db.reply.create({
      data: {
        ...data,
        workspaceId: comment.workspaceId,
        docId: comment.docId,
      },
    })) as Reply;
  }

  async getReply(id: string) {
    return (await this.db.reply.findUnique({
      where: { id, deletedAt: null },
    })) as Reply | null;
  }

  async listReplies(workspaceId: string, docId: string, commentId: string) {
    return (await this.db.reply.findMany({
      where: { workspaceId, docId, commentId, deletedAt: null },
      orderBy: { sid: 'asc' },
    })) as Reply[];
  }

  /**
   * Update a reply content
   * @param input - The reply update input
   * @returns The updated reply
   */
  async updateReply(input: ReplyUpdate) {
    const data = ReplyUpdateSchema.parse(input);
    return await this.db.reply.update({
      where: { id: data.id, deletedAt: null },
      data: { content: data.content },
    });
  }

  /**
   * Delete a reply
   * @param id - The id of the reply
   * @returns The deleted reply
   */
  async deleteReply(id: string) {
    await this.db.reply.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    this.logger.log(`Reply ${id} deleted`);
  }

  // #endregion
}
