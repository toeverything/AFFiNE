import { GraphQLScalarType, Kind } from 'graphql';
import type { FastifyRequest } from 'fastify';

import type { AuthService } from '../../application/auth-service.js';
import type { BlobService } from '../../application/blob-service.js';
import type { CommentService } from '../../application/comment-service.js';
import { encodeCursor } from '../../domain/comment.js';
import type { User } from '../../domain/identity.js';
import { toGraphQLError } from './graphql-error.js';

export const JSONObject = new GraphQLScalarType({
  name: 'JSONObject',
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return JSON.parse(ast.value) as unknown;
    }
    return null;
  },
});

export const commentsTypeDefs = /* GraphQL */ `
  scalar JSONObject

  enum DocMode {
    page
    edgeless
  }

  enum CommentChangeAction {
    update
    delete
  }

  input PaginationInput {
    first: Int
    offset: Int
    after: String
  }

  type PageInfo {
    startCursor: String
    endCursor: String
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type PublicUserType {
    id: String!
    name: String!
    avatarUrl: String
  }

  type ReplyObjectType {
    commentId: ID!
    id: ID!
    content: JSONObject!
    createdAt: DateTime!
    updatedAt: DateTime!
    user: PublicUserType!
  }

  type CommentObjectType {
    id: ID!
    content: JSONObject!
    resolved: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    user: PublicUserType!
    replies: [ReplyObjectType!]!
  }

  type CommentObjectTypeEdge {
    cursor: String!
    node: CommentObjectType!
  }

  type PaginatedCommentObjectType {
    totalCount: Int!
    edges: [CommentObjectTypeEdge!]!
    pageInfo: PageInfo!
  }

  type CommentChangeObjectType {
    id: ID!
    action: CommentChangeAction!
    commentId: ID
    item: JSONObject!
  }

  type CommentChangeObjectTypeEdge {
    cursor: String!
    node: CommentChangeObjectType!
  }

  type PaginatedCommentChangeObjectType {
    totalCount: Int!
    edges: [CommentChangeObjectTypeEdge!]!
    pageInfo: PageInfo!
  }

  input CommentCreateInput {
    workspaceId: ID!
    docId: ID!
    docMode: DocMode
    docTitle: String
    content: JSONObject!
    mentions: [String!]
  }

  input CommentUpdateInput {
    id: ID!
    content: JSONObject!
  }

  input CommentResolveInput {
    id: ID!
    resolved: Boolean!
  }

  input ReplyCreateInput {
    commentId: ID!
    content: JSONObject!
    docMode: DocMode
    docTitle: String
    mentions: [String!]
  }

  input ReplyUpdateInput {
    id: ID!
    content: JSONObject!
  }

  extend type WorkspaceType {
    comments(
      docId: String!
      pagination: PaginationInput
    ): PaginatedCommentObjectType!
    commentChanges(
      docId: String!
      pagination: PaginationInput
    ): PaginatedCommentChangeObjectType!
  }

  extend type Mutation {
    createComment(input: CommentCreateInput!): CommentObjectType!
    updateComment(input: CommentUpdateInput!): Boolean!
    deleteComment(id: String!): Boolean!
    resolveComment(input: CommentResolveInput!): Boolean!
    createReply(input: ReplyCreateInput!): ReplyObjectType!
    updateReply(input: ReplyUpdateInput!): Boolean!
    deleteReply(id: String!): Boolean!
    uploadCommentAttachment(
      workspaceId: String!
      docId: String!
      attachment: Upload!
    ): String!
  }
`;

interface PaginationArgs {
  first?: number | null;
  offset?: number | null;
  after?: string | null;
}

function paginationOf(pagination?: PaginationArgs | null) {
  if (!pagination) {
    return undefined;
  }
  return {
    ...(pagination.first != null ? { first: pagination.first } : {}),
    ...(pagination.offset != null ? { offset: pagination.offset } : {}),
    ...(pagination.after ? { after: pagination.after } : {}),
  };
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return Uint8Array.from(Buffer.from(await file.arrayBuffer()));
}

export function commentsResolvers(opts: {
  auth: AuthService;
  comments: CommentService;
  blobs: BlobService;
  publicUrl: string;
  requestOf: (ctx: { request?: FastifyRequest }) => FastifyRequest | undefined;
}) {
  const userOf = async (ctx: { request?: FastifyRequest }): Promise<User> =>
    opts.auth.requireUser(opts.requestOf(ctx)?.authSession ?? null);

  return {
    JSONObject,
    WorkspaceType: {
      comments: async (
        parent: { id: string },
        args: { docId: string; pagination?: PaginationArgs | null },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const page = await opts.comments.list(
            user,
            parent.id,
            args.docId,
            paginationOf(args.pagination)
          );
          return {
            totalCount: page.totalCount,
            edges: page.items.map(node => ({
              cursor: encodeCursor(node.createdAt, node.id),
              node,
            })),
            pageInfo: {
              startCursor: page.startCursor,
              endCursor: page.endCursor,
              hasNextPage: page.hasNextPage,
              hasPreviousPage: page.hasPreviousPage,
            },
          };
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      commentChanges: async (
        parent: { id: string },
        args: { docId: string; pagination?: PaginationArgs | null },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const page = await opts.comments.listChanges(
            user,
            parent.id,
            args.docId,
            paginationOf(args.pagination)
          );
          return {
            totalCount: page.totalCount,
            edges: page.items.map(change => ({
              cursor: encodeCursor(change.createdAt, change.id),
              node: {
                id: change.id,
                action: change.action,
                commentId: change.commentId,
                item: change.item,
              },
            })),
            pageInfo: {
              startCursor: page.startCursor,
              endCursor: page.endCursor,
              hasNextPage: page.hasNextPage,
              hasPreviousPage: page.hasPreviousPage,
            },
          };
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    Mutation: {
      createComment: async (
        _root: unknown,
        args: {
          input: { workspaceId: string; docId: string; content: unknown };
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.create(user, args.input);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      updateComment: async (
        _root: unknown,
        args: { input: { id: string; content: unknown } },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.update(user, args.input.id, args.input.content);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      deleteComment: async (
        _root: unknown,
        args: { id: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.delete(user, args.id);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      resolveComment: async (
        _root: unknown,
        args: { input: { id: string; resolved: boolean } },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.resolve(
            user,
            args.input.id,
            args.input.resolved
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      createReply: async (
        _root: unknown,
        args: { input: { commentId: string; content: unknown } },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.createReply(user, args.input);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      updateReply: async (
        _root: unknown,
        args: { input: { id: string; content: unknown } },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.updateReply(
            user,
            args.input.id,
            args.input.content
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      deleteReply: async (
        _root: unknown,
        args: { id: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.comments.deleteReply(user, args.id);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      uploadCommentAttachment: async (
        _root: unknown,
        args: { workspaceId: string; docId: string; attachment: File },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const bytes = await fileBytes(args.attachment);
          const key = await opts.blobs.setDirect(
            user,
            args.workspaceId,
            `cmt-${crypto.randomUUID()}`,
            args.attachment.type || 'application/octet-stream',
            bytes
          );
          const base = opts.publicUrl.replace(/\/$/, '');
          return `${base}/api/workspaces/${encodeURIComponent(args.workspaceId)}/blobs/v1/${encodeURIComponent(key)}`;
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
  };
}
