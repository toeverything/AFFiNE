import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';
import type { FastifyRequest } from 'fastify';

import type { AuthService } from '../../application/auth-service.js';
import type { BlobService } from '../../application/blob-service.js';
import type { DocService } from '../../application/doc-service.js';
import { AppError, errors } from '../../domain/errors.js';
import type { User } from '../../domain/identity.js';

export const blobTypeDefs = /* GraphQL */ `
  scalar Upload
  scalar SafeInt

  enum BlobUploadMethod {
    GRAPHQL
    MULTIPART
    PRESIGNED
  }

  type BlobUploadedPart {
    partNumber: Int!
    etag: String!
  }

  input BlobUploadPartInput {
    partNumber: Int!
    etag: String!
  }

  type BlobUploadInit {
    method: BlobUploadMethod!
    blobKey: String!
    alreadyUploaded: Boolean
    uploadUrl: String
    headers: JSON
    expiresAt: DateTime
    uploadId: String
    partSize: Int
    uploadedParts: [BlobUploadedPart!]
  }

  type BlobUploadPart {
    uploadUrl: String!
    headers: JSON
    expiresAt: DateTime
  }

  type ListedBlob {
    key: String!
    size: Int!
    mime: String!
    createdAt: String!
  }

  type EditorType {
    name: String!
    avatarUrl: String
  }

  type DocHistoryType {
    id: String!
    timestamp: DateTime!
    editor: EditorType
    workspaceId: String!
  }

  type WorkspaceQuotaHumanReadable {
    blobLimit: String!
    storageQuota: String!
    storageQuotaUsed: String!
    historyPeriod: String!
    memberLimit: String!
    memberCount: String!
    overcapacityMemberCount: String!
    name: String!
  }

  type WorkspaceQuotaType {
    blobLimit: SafeInt!
    storageQuota: SafeInt!
    usedStorageQuota: SafeInt!
    historyPeriod: SafeInt!
    memberLimit: Int!
    memberCount: Int!
    overcapacityMemberCount: Int!
    name: String!
    humanReadable: WorkspaceQuotaHumanReadable!
  }

  extend type WorkspaceType {
    blobs: [ListedBlob!]!
    quota: WorkspaceQuotaType!
    histories(guid: String!, take: Int, before: DateTime): [DocHistoryType!]!
    blobUploadPartUrl(
      key: String!
      uploadId: String!
      partNumber: Int!
    ): BlobUploadPart!
  }

  extend type Mutation {
    createBlobUpload(
      workspaceId: String!
      key: String!
      size: Int!
      mime: String!
    ): BlobUploadInit!
    completeBlobUpload(
      workspaceId: String!
      key: String!
      uploadId: String
      parts: [BlobUploadPartInput!]
    ): String!
    abortBlobUpload(
      workspaceId: String!
      key: String!
      uploadId: String!
    ): Boolean!
    setBlob(workspaceId: String!, blob: Upload!): String!
    deleteBlob(
      workspaceId: String!
      key: String
      hash: String
      permanently: Boolean
    ): Boolean!
    releaseDeletedBlobs(workspaceId: String!): Boolean!
    recoverDoc(
      workspaceId: String!
      guid: String!
      timestamp: DateTime!
    ): DateTime!
  }
`;

export const SafeInt = new GraphQLScalarType({
  name: 'SafeInt',
  serialize(value: unknown) {
    return Number(value);
  },
  parseValue(value: unknown) {
    return Number(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return Number(ast.value);
    }
    return null;
  },
});

export const Upload = new GraphQLScalarType({
  name: 'Upload',
  parseValue(value: unknown) {
    if (value instanceof File || value instanceof Blob) {
      return value;
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'arrayBuffer' in value &&
      typeof (value as { arrayBuffer: unknown }).arrayBuffer === 'function'
    ) {
      return value as File;
    }
    throw new TypeError('Upload value must be a File.');
  },
});

function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof AppError) {
    return new GraphQLError(error.message, {
      extensions: { ...(error.toJSON() as unknown as Record<string, unknown>) },
      originalError: error,
    });
  }
  if (error instanceof GraphQLError) {
    return error;
  }
  return new GraphQLError('Internal Server Error', {
    extensions: {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      type: 'INTERNAL_SERVER_ERROR',
      name: 'INTERNAL_SERVER_ERROR',
      message: 'Internal Server Error',
    },
  });
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return Uint8Array.from(Buffer.from(await file.arrayBuffer()));
}

export function blobResolvers(opts: {
  auth: AuthService;
  blobs: BlobService;
  docs: DocService;
  requestOf: (ctx: { request?: FastifyRequest }) => FastifyRequest | undefined;
}) {
  const userOf = async (ctx: { request?: FastifyRequest }): Promise<User> =>
    opts.auth.requireUser(opts.requestOf(ctx)?.authSession ?? null);

  return {
    SafeInt,
    Upload,
    WorkspaceType: {
      blobs: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const list = await opts.blobs.list(user, parent.id);
          return list.map(blob => ({
            key: blob.key,
            size: blob.size,
            mime: blob.mime,
            createdAt: blob.createdAt.toISOString(),
          }));
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      quota: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.blobs.quota(user, parent.id);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      histories: async (
        parent: { id: string },
        args: { guid: string; take?: number; before?: Date },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const list = await opts.docs.listHistories(
            user,
            parent.id,
            args.guid,
            {
              take: args.take ?? 10,
              ...(args.before ? { before: args.before } : {}),
            }
          );
          return Promise.all(
            list.map(async item => {
              const editor = item.editorId
                ? await opts.auth.getUserById(item.editorId)
                : null;
              return {
                id: `${item.docId}@${item.timestamp}`,
                timestamp: new Date(item.timestamp),
                workspaceId: parent.id,
                editor: editor
                  ? { name: editor.name, avatarUrl: editor.avatarUrl }
                  : null,
              };
            })
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      blobUploadPartUrl: async (
        parent: { id: string },
        args: { key: string; uploadId: string; partNumber: number },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.blobs.partUrl(user, {
            workspaceId: parent.id,
            key: args.key,
            uploadId: args.uploadId,
            partNumber: args.partNumber,
          });
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    Mutation: {
      createBlobUpload: async (
        _root: unknown,
        args: { workspaceId: string; key: string; size: number; mime: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.blobs.createUpload(user, args);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      completeBlobUpload: async (
        _root: unknown,
        args: {
          workspaceId: string;
          key: string;
          uploadId?: string | null;
          parts?: Array<{ partNumber: number; etag: string }> | null;
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.blobs.complete(user, args);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      abortBlobUpload: async (
        _root: unknown,
        args: { workspaceId: string; key: string; uploadId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.blobs.abort(user, args);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      setBlob: async (
        _root: unknown,
        args: { workspaceId: string; blob: File },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const bytes = await fileBytes(args.blob);
          return opts.blobs.setDirect(
            user,
            args.workspaceId,
            args.blob.name,
            args.blob.type || 'application/octet-stream',
            bytes
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      deleteBlob: async (
        _root: unknown,
        args: {
          workspaceId: string;
          key?: string | null;
          hash?: string | null;
          permanently?: boolean | null;
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const key = args.key ?? args.hash;
          if (!key) {
            throw errors.badRequest('key is required.');
          }
          return opts.blobs.delete(
            user,
            args.workspaceId,
            key,
            Boolean(args.permanently)
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      releaseDeletedBlobs: async (
        _root: unknown,
        args: { workspaceId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.blobs.releaseDeleted(user, args.workspaceId);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      recoverDoc: async (
        _root: unknown,
        args: { workspaceId: string; guid: string; timestamp: Date },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.docs.recover(
            user,
            args.workspaceId,
            args.guid,
            args.timestamp
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
  };
}
