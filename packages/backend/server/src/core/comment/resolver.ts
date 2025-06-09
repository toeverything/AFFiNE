import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { CommentNotFound, ReplyNotFound } from '../../base';
import {
  decodeWithJson,
  paginateWithCustomCursor,
  PaginationInput,
} from '../../base/graphql';
import { CurrentUser } from '../auth/session';
import { AccessController, DocAction } from '../permission';
import { UserType } from '../user';
import { WorkspaceType } from '../workspaces';
import { CommentService } from './service';
import {
  CommentCreateInput,
  CommentObjectType,
  CommentResolveInput,
  CommentUpdateInput,
  PaginatedCommentChangeObjectType,
  PaginatedCommentObjectType,
  ReplyCreateInput,
  ReplyObjectType,
  ReplyUpdateInput,
} from './types';

export interface CommentCursor {
  sid?: number;
  commentUpdatedAt?: Date;
  replyUpdatedAt?: Date;
}

@Resolver(() => WorkspaceType)
export class CommentResolver {
  constructor(
    private readonly service: CommentService,
    private readonly ac: AccessController
  ) {}

  @Mutation(() => CommentObjectType)
  async createComment(
    @CurrentUser() me: UserType,
    @Args('input') input: CommentCreateInput
  ): Promise<CommentObjectType> {
    await this.assertPermission(me, input, 'Doc.Comments.Create');

    const comment = await this.service.createComment({
      ...input,
      userId: me.id,
    });
    return {
      ...comment,
      content: comment.content as object,
      user: {
        id: me.id,
        name: me.name,
        avatarUrl: me.avatarUrl,
      },
      replies: [],
    };
  }

  @Mutation(() => Boolean, {
    description: 'Update a comment content',
  })
  async updateComment(
    @CurrentUser() me: UserType,
    @Args('input') input: CommentUpdateInput
  ) {
    const comment = await this.service.getComment(input.id);
    if (!comment) {
      throw new CommentNotFound();
    }

    await this.assertPermission(me, comment, 'Doc.Comments.Update');

    await this.service.updateComment(input);
    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Resolve a comment or not',
  })
  async resolveComment(
    @CurrentUser() me: UserType,
    @Args('input') input: CommentResolveInput
  ) {
    const comment = await this.service.getComment(input.id);
    if (!comment) {
      throw new CommentNotFound();
    }

    await this.assertPermission(me, comment, 'Doc.Comments.Resolve');

    await this.service.resolveComment(input);
    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Delete a comment',
  })
  async deleteComment(@CurrentUser() me: UserType, @Args('id') id: string) {
    const comment = await this.service.getComment(id);
    if (!comment) {
      throw new CommentNotFound();
    }

    await this.assertPermission(me, comment, 'Doc.Comments.Delete');

    await this.service.deleteComment(id);
    return true;
  }

  @Mutation(() => ReplyObjectType)
  async createReply(
    @CurrentUser() me: UserType,
    @Args('input') input: ReplyCreateInput
  ): Promise<ReplyObjectType> {
    const comment = await this.service.getComment(input.commentId);
    if (!comment) {
      throw new CommentNotFound();
    }

    await this.assertPermission(me, comment, 'Doc.Comments.Create');

    const reply = await this.service.createReply({
      ...input,
      userId: me.id,
    });
    return {
      ...reply,
      content: reply.content as object,
      user: {
        id: me.id,
        name: me.name,
        avatarUrl: me.avatarUrl,
      },
    };
  }

  @Mutation(() => Boolean, {
    description: 'Update a reply content',
  })
  async updateReply(
    @CurrentUser() me: UserType,
    @Args('input') input: ReplyUpdateInput
  ) {
    const reply = await this.service.getReply(input.id);
    if (!reply) {
      throw new ReplyNotFound();
    }

    await this.assertPermission(me, reply, 'Doc.Comments.Update');

    await this.service.updateReply(input);
    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Delete a reply',
  })
  async deleteReply(@CurrentUser() me: UserType, @Args('id') id: string) {
    const reply = await this.service.getReply(id);
    if (!reply) {
      throw new ReplyNotFound();
    }

    await this.assertPermission(me, reply, 'Doc.Comments.Delete');

    await this.service.deleteReply(id);
    return true;
  }

  @ResolveField(() => PaginatedCommentObjectType, {
    description: 'Get comments of a doc',
  })
  async comments(
    @CurrentUser() me: UserType,
    @Parent() workspace: WorkspaceType,
    @Args('docId') docId: string,
    @Args({
      name: 'pagination',
      nullable: true,
    })
    pagination?: PaginationInput
  ): Promise<PaginatedCommentObjectType> {
    await this.assertPermission(
      me,
      {
        workspaceId: workspace.id,
        docId,
      },
      'Doc.Comments.Read'
    );

    const cursor: CommentCursor = decodeWithJson(pagination?.after) ?? {};
    const [totalCount, comments] = await Promise.all([
      this.service.getCommentCount(workspace.id, docId),
      this.service.listComments(workspace.id, docId, {
        sid: cursor.sid,
        take: pagination?.first,
      }),
    ]);
    const endCursor: CommentCursor = {};
    const startCursor: CommentCursor = {};
    if (comments.length > 0) {
      const lastComment = comments[comments.length - 1];
      // next page cursor
      endCursor.sid = lastComment.sid;
      const firstComment = comments[0];
      startCursor.sid = firstComment.sid;
      startCursor.commentUpdatedAt = firstComment.updatedAt;
      let replyUpdatedAt: Date | undefined;

      // find latest reply
      for (const comment of comments) {
        for (const reply of comment.replies) {
          if (
            !replyUpdatedAt ||
            reply.updatedAt.getTime() > replyUpdatedAt.getTime()
          ) {
            replyUpdatedAt = reply.updatedAt;
          }
        }
      }
      if (!replyUpdatedAt) {
        // if no reply, use comment updated at as reply updated at
        replyUpdatedAt = startCursor.commentUpdatedAt;
      }
      startCursor.replyUpdatedAt = replyUpdatedAt;
    }

    return paginateWithCustomCursor(
      comments,
      totalCount,
      startCursor,
      endCursor,
      // not support to get previous page
      false
    );
  }

  @ResolveField(() => PaginatedCommentChangeObjectType, {
    description: 'Get comment changes of a doc',
  })
  async commentChanges(
    @CurrentUser() me: UserType,
    @Parent() workspace: WorkspaceType,
    @Args('docId') docId: string,
    @Args({
      name: 'pagination',
    })
    pagination: PaginationInput
  ): Promise<PaginatedCommentChangeObjectType> {
    await this.assertPermission(
      me,
      {
        workspaceId: workspace.id,
        docId,
      },
      'Doc.Comments.Read'
    );

    const cursor: CommentCursor = decodeWithJson(pagination.after) ?? {};
    const changes = await this.service.listCommentChanges(workspace.id, docId, {
      commentUpdatedAt: cursor.commentUpdatedAt,
      replyUpdatedAt: cursor.replyUpdatedAt,
      take: pagination.first,
    });

    const endCursor = cursor;
    for (const c of changes) {
      if (c.commentId) {
        // is reply change
        endCursor.replyUpdatedAt = c.item.updatedAt;
      } else {
        // is comment change
        endCursor.commentUpdatedAt = c.item.updatedAt;
      }
    }

    return paginateWithCustomCursor(
      changes,
      changes.length,
      // not support to get start cursor
      null,
      endCursor,
      // not support to get previous page
      false
    );
  }

  private async assertPermission(
    me: UserType,
    item: {
      workspaceId: string;
      docId: string;
      userId?: string;
    },
    action: DocAction
  ) {
    // the owner of the comment/reply can update, delete, resolve it
    if (item.userId === me.id) {
      return;
    }

    await this.ac
      .user(me.id)
      .workspace(item.workspaceId)
      .doc(item.docId)
      .assert(action);
  }
}
