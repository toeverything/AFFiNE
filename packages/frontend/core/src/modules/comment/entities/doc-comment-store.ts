import {
  createCommentMutation,
  createReplyMutation,
  deleteCommentMutation,
  deleteReplyMutation,
  type DocMode,
  listCommentChangesQuery,
  type ListCommentsQuery,
  listCommentsQuery,
  resolveCommentMutation,
  updateCommentMutation,
  updateReplyMutation,
} from '@affine/graphql';
import { Entity } from '@toeverything/infra';

import type { DefaultServerService, WorkspaceServerService } from '../../cloud';
import { GraphQLService } from '../../cloud/services/graphql';
import type { WorkspaceService } from '../../workspace';
import type {
  DocComment,
  DocCommentChangeListResult,
  DocCommentContent,
  DocCommentListResult,
  DocCommentReply,
} from '../types';

type GQLCommentType =
  ListCommentsQuery['workspace']['comments']['edges'][number]['node'];
type GQLReplyType = GQLCommentType['replies'][number];
type GQLUserType = GQLCommentType['user'];

// Helper functions for normalizing backend responses
const normalizeUser = (user: GQLUserType) => ({
  id: user.id,
  name: user.name,
  avatarUrl: user.avatarUrl,
});

const normalizeReply = (reply: GQLReplyType): DocCommentReply => ({
  id: reply.id,
  content: reply.content as DocCommentContent,
  createdAt: new Date(reply.createdAt).getTime(),
  updatedAt: new Date(reply.updatedAt).getTime(),
  user: normalizeUser(reply.user),
});

const normalizeComment = (comment: GQLCommentType): DocComment => ({
  id: comment.id,
  content: comment.content as DocCommentContent,
  resolved: comment.resolved,
  createdAt: new Date(comment.createdAt).getTime(),
  updatedAt: new Date(comment.updatedAt).getTime(),
  user: comment.user
    ? normalizeUser(comment.user)
    : {
        id: '',
        name: '',
        avatarUrl: '',
      },
  replies: comment.replies?.map(normalizeReply) ?? [],
});

export class DocCommentStore extends Entity<{
  docId: string;
  getDocMode: () => DocMode;
  getDocTitle: () => string;
}> {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService
  ) {
    super();
  }

  private get serverService() {
    return (
      this.workspaceServerService.server || this.defaultServerService.server
    );
  }

  private get graphqlService() {
    return this.serverService?.scope.get(GraphQLService);
  }

  private get currentWorkspaceId() {
    return this.workspaceService.workspace.id;
  }

  async listComments({
    after,
  }: {
    after?: string;
  }): Promise<DocCommentListResult> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }
    const response = await graphql.gql({
      query: listCommentsQuery,
      variables: {
        pagination: {
          after,
        },
        workspaceId: this.currentWorkspaceId,
        docId: this.props.docId,
      },
    });

    const comments = response.workspace?.comments;
    if (!comments) {
      return {
        comments: [],
        hasNextPage: false,
        startCursor: '',
        endCursor: '',
      };
    }

    return {
      comments: comments.edges.map(edge => normalizeComment(edge.node)),
      hasNextPage: comments.pageInfo.hasNextPage,
      startCursor: comments.pageInfo.startCursor || '',
      endCursor: comments.pageInfo.endCursor || '',
    };
  }

  // pool every 30s
  async listCommentChanges({
    after,
  }: {
    after?: string;
  }): Promise<DocCommentChangeListResult> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    const response = await graphql.gql({
      query: listCommentChangesQuery,
      variables: {
        pagination: {
          after,
        },
        workspaceId: this.currentWorkspaceId,
        docId: this.props.docId,
      },
    });

    const commentChanges = response.workspace?.commentChanges;
    if (!commentChanges) {
      return [];
    }

    return commentChanges.edges.map(edge => ({
      id: edge.node.id,
      action: edge.node.action,
      comment: normalizeComment(edge.node.item),
      commentId: edge.node.commentId || undefined,
    }));
  }

  async createComment(commentInput: {
    content: DocCommentContent;
  }): Promise<DocComment> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    const response = await graphql.gql({
      query: createCommentMutation,
      variables: {
        input: {
          workspaceId: this.currentWorkspaceId,
          docId: this.props.docId,
          docMode: this.props.getDocMode(),
          docTitle: this.props.getDocTitle(),
          content: commentInput.content,
        },
      },
    });

    const comment = response.createComment;
    return normalizeComment(comment);
  }

  async updateComment(
    commentId: string,
    commentInput: {
      content: DocCommentContent;
    }
  ): Promise<void> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    await graphql.gql({
      query: updateCommentMutation,
      variables: {
        input: {
          id: commentId,
          content: commentInput.content,
        },
      },
    });
  }

  async resolveComment(commentId: string, resolved = true): Promise<boolean> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    const response = await graphql.gql({
      query: resolveCommentMutation,
      variables: {
        input: {
          id: commentId,
          resolved,
        },
      },
    });

    return response.resolveComment;
  }

  async deleteComment(commentId: string): Promise<boolean> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    const response = await graphql.gql({
      query: deleteCommentMutation,
      variables: {
        id: commentId,
      },
    });
    return response.deleteComment;
  }

  async createReply(
    commentId: string,
    replyInput: {
      content: DocCommentContent;
    }
  ): Promise<DocCommentReply> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    const response = await graphql.gql({
      query: createReplyMutation,
      variables: {
        input: {
          commentId,
          content: replyInput.content,
          docMode: this.props.getDocMode(),
          docTitle: this.props.getDocTitle(),
        },
      },
    });
    return normalizeReply(response.createReply);
  }

  async updateReply(
    replyId: string,
    replyInput: {
      content: DocCommentContent;
    }
  ): Promise<void> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    await graphql.gql({
      query: updateReplyMutation,
      variables: {
        input: {
          id: replyId,
          content: replyInput.content,
        },
      },
    });
  }

  async deleteReply(replyId: string): Promise<void> {
    const graphql = this.graphqlService;
    if (!graphql) {
      throw new Error('GraphQL service not found');
    }

    await graphql.gql({
      query: deleteReplyMutation,
      variables: {
        id: replyId,
      },
    });
  }
}
