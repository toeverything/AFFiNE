import { errors } from '../domain/errors.js';
import {
  encodeCursor,
  type CommentChangeRecord,
  type CommentRecord,
  type CommentReplyRecord,
  type PageSlice,
  type Pagination,
} from '../domain/comment.js';
import type { User } from '../domain/identity.js';
import type {
  Clock,
  CommentStore,
  IdentityStore,
  RealtimeHub,
} from '../domain/ports.js';
import { WorkspaceService } from './workspace-service.js';
import type { WebhookService } from './webhook-service.js';

export interface PublicCommentUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface CommentView {
  id: string;
  content: unknown;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: PublicCommentUser;
  replies: ReplyView[];
}

export interface ReplyView {
  commentId: string;
  id: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
  user: PublicCommentUser;
}

export class CommentService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly comments: CommentStore,
    private readonly identity: IdentityStore,
    private readonly clock: Clock,
    private readonly hub?: RealtimeHub,
    private readonly extras: { webhooks?: WebhookService } = {}
  ) {}

  async list(
    user: User,
    workspaceId: string,
    docId: string,
    pagination?: Pagination
  ): Promise<PageSlice<CommentView>> {
    await this.workspaces.requireMember(user, workspaceId);
    const { items, totalCount, hasNextPage } = await this.comments.listComments(
      workspaceId,
      docId,
      pagination
    );
    const replies = await this.comments.listRepliesForComments(
      items.map(item => item.id)
    );
    const users = await this.usersOf([
      ...items.map(item => item.userId),
      ...replies.map(item => item.userId),
    ]);
    const grouped = new Map<string, CommentReplyRecord[]>();
    for (const reply of replies) {
      const list = grouped.get(reply.commentId) ?? [];
      list.push(reply);
      grouped.set(reply.commentId, list);
    }
    const views = items.map(item =>
      this.toComment(
        item,
        (grouped.get(item.id) ?? []).sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        ),
        users
      )
    );
    return this.slice(views, totalCount, pagination, hasNextPage);
  }

  async create(
    user: User,
    input: { workspaceId: string; docId: string; content: unknown }
  ): Promise<CommentView> {
    await this.workspaces.requireMember(user, input.workspaceId);
    const now = this.clock.now();
    const comment = await this.comments.createComment({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      docId: input.docId,
      userId: user.id,
      content: input.content,
      resolved: false,
      createdAt: now,
      updatedAt: now,
    });
    this.emitChanged(
      input.workspaceId,
      input.docId,
      encodeCursor(comment.createdAt, comment.id)
    );
    await this.extras.webhooks?.emit(input.workspaceId, 'comment.created', {
      commentId: comment.id,
      docId: input.docId,
    });
    return this.toComment(comment, [], new Map([[user.id, user]]));
  }

  async update(user: User, id: string, content: unknown): Promise<boolean> {
    const comment = await this.requireComment(id);
    await this.requireAuthorOrAdmin(user, comment.workspaceId, comment.userId);
    const updated = await this.comments.updateComment(id, {
      content,
      updatedAt: this.clock.now(),
    });
    await this.recordChange(updated, 'update', updated.id);
    this.emitChanged(
      updated.workspaceId,
      updated.docId,
      encodeCursor(updated.updatedAt, updated.id)
    );
    return true;
  }

  async resolve(user: User, id: string, resolved: boolean): Promise<boolean> {
    const comment = await this.requireComment(id);
    await this.workspaces.requireMember(user, comment.workspaceId);
    const updated = await this.comments.updateComment(id, {
      resolved,
      updatedAt: this.clock.now(),
    });
    await this.recordChange(updated, 'update', updated.id);
    this.emitChanged(
      updated.workspaceId,
      updated.docId,
      encodeCursor(updated.updatedAt, updated.id)
    );
    return true;
  }

  async delete(user: User, id: string): Promise<boolean> {
    const comment = await this.requireComment(id);
    await this.requireAuthorOrAdmin(user, comment.workspaceId, comment.userId);
    await this.recordChange(comment, 'delete', comment.id);
    await this.comments.deleteComment(id);
    this.emitChanged(
      comment.workspaceId,
      comment.docId,
      encodeCursor(this.clock.now(), comment.id)
    );
    return true;
  }

  async createReply(
    user: User,
    input: { commentId: string; content: unknown }
  ): Promise<ReplyView> {
    const comment = await this.requireComment(input.commentId);
    await this.workspaces.requireMember(user, comment.workspaceId);
    const now = this.clock.now();
    const reply = await this.comments.createReply({
      id: crypto.randomUUID(),
      commentId: comment.id,
      userId: user.id,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    });
    await this.recordChange(comment, 'update', comment.id, reply);
    this.emitChanged(
      comment.workspaceId,
      comment.docId,
      encodeCursor(reply.createdAt, reply.id)
    );
    return this.toReply(reply, new Map([[user.id, user]]));
  }

  async updateReply(
    user: User,
    id: string,
    content: unknown
  ): Promise<boolean> {
    const reply = await this.requireReply(id);
    const comment = await this.requireComment(reply.commentId);
    await this.requireAuthorOrAdmin(user, comment.workspaceId, reply.userId);
    const updated = await this.comments.updateReply(id, {
      content,
      updatedAt: this.clock.now(),
    });
    await this.recordChange(comment, 'update', comment.id, updated);
    this.emitChanged(
      comment.workspaceId,
      comment.docId,
      encodeCursor(updated.updatedAt, updated.id)
    );
    return true;
  }

  async deleteReply(user: User, id: string): Promise<boolean> {
    const reply = await this.requireReply(id);
    const comment = await this.requireComment(reply.commentId);
    await this.requireAuthorOrAdmin(user, comment.workspaceId, reply.userId);
    await this.recordChange(comment, 'delete', reply.id, reply);
    await this.comments.deleteReply(id);
    this.emitChanged(
      comment.workspaceId,
      comment.docId,
      encodeCursor(this.clock.now(), reply.id)
    );
    return true;
  }

  async listChanges(
    user: User,
    workspaceId: string,
    docId: string,
    pagination?: Pagination
  ): Promise<PageSlice<CommentChangeRecord>> {
    await this.workspaces.requireMember(user, workspaceId);
    const { items, totalCount, hasNextPage } =
      await this.comments.listCommentChanges(workspaceId, docId, pagination);
    return this.slice(items, totalCount, pagination, hasNextPage);
  }

  private async recordChange(
    comment: CommentRecord,
    action: 'update' | 'delete',
    entityId: string,
    reply?: CommentReplyRecord
  ): Promise<void> {
    const users = await this.usersOf([
      comment.userId,
      ...(reply ? [reply.userId] : []),
    ]);
    const item = reply
      ? this.toReply(reply, users)
      : this.toComment(comment, [], users);
    await this.comments.appendCommentChange({
      workspaceId: comment.workspaceId,
      docId: comment.docId,
      action,
      item,
      commentId: reply ? comment.id : null,
      entityId,
      createdAt: this.clock.now(),
    });
  }

  private emitChanged(
    workspaceId: string,
    docId: string,
    cursor: string
  ): void {
    this.hub?.emit(
      'comment.changed',
      { workspaceId, docId },
      { changed: true, cursor }
    );
  }

  private async requireComment(id: string): Promise<CommentRecord> {
    const comment = await this.comments.getComment(id);
    if (!comment) {
      throw errors.commentNotFound();
    }
    return comment;
  }

  private async requireReply(id: string): Promise<CommentReplyRecord> {
    const reply = await this.comments.getReply(id);
    if (!reply) {
      throw errors.commentNotFound();
    }
    return reply;
  }

  private async requireAuthorOrAdmin(
    user: User,
    workspaceId: string,
    authorId: string
  ): Promise<void> {
    const member = await this.workspaces.requireMember(user, workspaceId);
    if (user.id === authorId) {
      return;
    }
    if (member.role !== 'owner' && member.role !== 'admin') {
      throw errors.spaceAccessDenied(workspaceId);
    }
  }

  private toComment(
    comment: CommentRecord,
    replies: CommentReplyRecord[],
    users: Map<string, User>
  ): CommentView {
    return {
      id: comment.id,
      content: comment.content,
      resolved: comment.resolved,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: this.publicUser(users.get(comment.userId), comment.userId),
      replies: replies.map(reply => this.toReply(reply, users)),
    };
  }

  private toReply(
    reply: CommentReplyRecord,
    users: Map<string, User>
  ): ReplyView {
    return {
      commentId: reply.commentId,
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
      user: this.publicUser(users.get(reply.userId), reply.userId),
    };
  }

  private publicUser(user: User | undefined, id: string): PublicCommentUser {
    return {
      id: user?.id ?? id,
      name: user?.name ?? 'Unknown',
      avatarUrl: user?.avatarUrl ?? null,
    };
  }

  private async usersOf(ids: string[]): Promise<Map<string, User>> {
    const unique = [...new Set(ids)];
    const map = new Map<string, User>();
    for (const id of unique) {
      const user = await this.identity.findUserById(id);
      if (user) {
        map.set(id, user);
      }
    }
    return map;
  }

  private slice<T extends { createdAt: Date; id: string }>(
    items: T[],
    totalCount: number,
    pagination: Pagination | undefined,
    hasNextPage: boolean
  ): PageSlice<T> {
    const startCursor = items[0]
      ? encodeCursor(items[0].createdAt, items[0].id)
      : null;
    const end = items[items.length - 1];
    const endCursor = end ? encodeCursor(end.createdAt, end.id) : null;
    const offset = pagination?.offset ?? 0;
    return {
      items,
      totalCount,
      startCursor,
      endCursor,
      hasNextPage,
      hasPreviousPage: Boolean(pagination?.after) || offset > 0,
    };
  }
}
