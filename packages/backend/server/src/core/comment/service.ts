import { Injectable } from '@nestjs/common';

import {
  CommentCreate,
  CommentResolve,
  CommentUpdate,
  ItemWithUserId,
  Models,
  ReplyCreate,
  ReplyUpdate,
} from '../../models';
import { PublicUserType } from '../user';

@Injectable()
export class CommentService {
  constructor(private readonly models: Models) {}

  async createComment(input: CommentCreate) {
    const comment = await this.models.comment.create(input);
    return await this.fillUser(comment);
  }

  async getComment(id: string) {
    const comment = await this.models.comment.get(id);
    return comment ? await this.fillUser(comment) : null;
  }

  async updateComment(input: CommentUpdate) {
    return await this.models.comment.update(input);
  }

  async resolveComment(input: CommentResolve) {
    return await this.models.comment.resolve(input);
  }

  async deleteComment(id: string) {
    return await this.models.comment.delete(id);
  }

  async createReply(input: ReplyCreate) {
    const reply = await this.models.comment.createReply(input);
    return await this.fillUser(reply);
  }

  async getReply(id: string) {
    const reply = await this.models.comment.getReply(id);
    return reply ? await this.fillUser(reply) : null;
  }

  async updateReply(input: ReplyUpdate) {
    return await this.models.comment.updateReply(input);
  }

  async deleteReply(id: string) {
    return await this.models.comment.deleteReply(id);
  }

  async getCommentCount(workspaceId: string, docId: string) {
    return await this.models.comment.count(workspaceId, docId);
  }

  async listComments(
    workspaceId: string,
    docId: string,
    options?: {
      sid?: number;
      take?: number;
    }
  ) {
    const comments = await this.models.comment.list(
      workspaceId,
      docId,
      options
    );

    // fill user info
    const userMap = await this.models.user.getPublicUsersMap([
      ...comments,
      ...comments.flatMap(c => c.replies),
    ]);

    return comments.map(c => ({
      ...c,
      user: userMap.get(c.userId) as PublicUserType,
      replies: c.replies.map(r => ({
        ...r,
        user: userMap.get(r.userId) as PublicUserType,
      })),
    }));
  }

  async listCommentChanges(
    workspaceId: string,
    docId: string,
    options: {
      commentUpdatedAt?: Date;
      replyUpdatedAt?: Date;
      take?: number;
    }
  ) {
    const changes = await this.models.comment.listChanges(
      workspaceId,
      docId,
      options
    );

    // fill user info
    const userMap = await this.models.user.getPublicUsersMap(
      changes.map(c => c.item as ItemWithUserId)
    );

    return changes.map(c => ({
      ...c,
      item:
        'userId' in c.item
          ? {
              ...c.item,
              user: userMap.get(c.item.userId) as PublicUserType,
            }
          : c.item,
    }));
  }

  private async fillUser<T extends { userId: string }>(item: T) {
    const user = await this.models.user.getPublicUser(item.userId);
    return {
      ...item,
      user: user as PublicUserType,
    };
  }
}
