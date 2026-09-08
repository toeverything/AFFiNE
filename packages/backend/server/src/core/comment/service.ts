import { Injectable } from '@nestjs/common';

import {
  Comment,
  CommentCreate,
  CommentResolve,
  CommentUpdate,
  ItemWithUserId,
  Models,
  Reply,
  ReplyCreate,
  ReplyUpdate,
} from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { PublicUserType } from '../user';

@Injectable()
export class CommentService {
  constructor(
    private readonly models: Models,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  async createComment(
    actorUserId: string,
    input: Omit<CommentCreate, 'userId'> & {
      docTitle: string;
      docMode: string;
      mentions?: string[];
    }
  ) {
    const comment = this.domainItem<Comment>(
      await this.runtime.executeDomainCommandV1({
        command: 'create_comment',
        actorUserId,
        workspaceId: input.workspaceId,
        docId: input.docId,
        content: input.content,
        docTitle: input.docTitle,
        docMode: input.docMode,
        mentions: input.mentions ?? [],
      })
    );
    return await this.fillUser(comment);
  }

  async getComment(id: string) {
    const comment = await this.models.comment.get(id);
    return comment ? await this.fillUser(comment) : null;
  }

  async updateComment(actorUserId: string, input: CommentUpdate) {
    return this.domainItem<Comment>(
      await this.runtime.executeDomainCommandV1({
        command: 'update_comment',
        actorUserId,
        id: input.id,
        content: input.content,
      })
    );
  }

  async resolveComment(actorUserId: string, input: CommentResolve) {
    return this.domainItem<Comment>(
      await this.runtime.executeDomainCommandV1({
        command: 'resolve_comment',
        actorUserId,
        id: input.id,
        resolved: input.resolved,
      })
    );
  }

  async deleteComment(actorUserId: string, id: string) {
    return this.domainItem<Comment>(
      await this.runtime.executeDomainCommandV1({
        command: 'delete_comment',
        actorUserId,
        id,
      })
    );
  }

  async createReply(
    actorUserId: string,
    input: Omit<ReplyCreate, 'userId'> & {
      docTitle: string;
      docMode: string;
      mentions?: string[];
    }
  ) {
    const reply = this.domainItem<Reply>(
      await this.runtime.executeDomainCommandV1({
        command: 'create_reply',
        actorUserId,
        commentId: input.commentId,
        content: input.content,
        docTitle: input.docTitle,
        docMode: input.docMode,
        mentions: input.mentions ?? [],
      })
    );
    return await this.fillUser(reply);
  }

  async getReply(id: string) {
    const reply = await this.models.comment.getReply(id);
    return reply ? await this.fillUser(reply) : null;
  }

  async updateReply(actorUserId: string, input: ReplyUpdate) {
    return this.domainItem<Reply>(
      await this.runtime.executeDomainCommandV1({
        command: 'update_reply',
        actorUserId,
        id: input.id,
        content: input.content,
      })
    );
  }

  async deleteReply(actorUserId: string, id: string) {
    return this.domainItem<Reply>(
      await this.runtime.executeDomainCommandV1({
        command: 'delete_reply',
        actorUserId,
        id,
      })
    );
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

  private domainItem<T extends { createdAt: Date; updatedAt: Date }>(
    output: Record<string, unknown>
  ): T {
    return {
      ...output,
      createdAt: new Date(output.createdAt as string),
      updatedAt: new Date(output.updatedAt as string),
      ...(output.deletedAt
        ? { deletedAt: new Date(output.deletedAt as string) }
        : {}),
    } as T;
  }
}
