import { AsyncLocalStorage } from 'node:async_hooks';

import {
  GraphQLError,
  GraphQLScalarType,
  Kind,
  type GraphQLSchema,
} from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import type { AuthService } from '../../application/auth-service.js';
import type { AiGatewayService } from '../../application/ai-gateway.js';
import type { AuditService } from '../../application/audit-service.js';
import type { BlobService } from '../../application/blob-service.js';
import type { CommentService } from '../../application/comment-service.js';
import type { DocService } from '../../application/doc-service.js';
import type { MembershipService } from '../../application/membership-service.js';
import type { SearchService } from '../../application/search-service.js';
import type { SecurityPolicyService } from '../../application/security-policy-service.js';
import type { ShareService } from '../../application/share-service.js';
import type { SsoService } from '../../application/sso-service.js';
import type { WorkspaceService } from '../../application/workspace-service.js';
import type { AppConfig } from '../../config/env.js';
import { AppError, errors } from '../../domain/errors.js';
import type { User } from '../../domain/identity.js';
import { blobResolvers, blobTypeDefs } from './graphql-blobs.js';
import {
  commentsResolvers,
  commentsTypeDefs,
  JSONObject,
} from './graphql-comments.js';
import { membersResolvers, membersTypeDefs } from './graphql-members.js';
import {
  platformResolvers,
  platformTypeDefs,
  serverConfigFeatures,
  serverConfigOauthProviders,
} from './graphql-platform.js';
import { shareResolvers, shareTypeDefs } from './graphql-share.js';

const graphqlRequest = new AsyncLocalStorage<FastifyRequest>();

function httpRequest(ctx: {
  request?: FastifyRequest;
}): FastifyRequest | undefined {
  return ctx.request ?? graphqlRequest.getStore();
}

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize(value: unknown) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    throw new TypeError('DateTime cannot be serialized');
  },
  parseValue(value: unknown) {
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    throw new TypeError('DateTime cannot be parsed');
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    throw new TypeError('DateTime cannot be parsed');
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return JSON.parse(ast.value);
    }
    if (ast.kind === Kind.NULL) {
      return null;
    }
    return null;
  },
});

const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSON

  enum ServerDeploymentType {
    Affine
    Selfhosted
  }

  enum ServerFeature {
    Captcha
    Comment
    Copilot
    CopilotEmbedding
    Indexer
    LocalWorkspace
    OAuth
    Payment
  }

  enum FeatureType {
    Admin
  }

  enum CalendarProviderType {
    Google
  }

  enum OAuthProviderType {
    Google
    GitHub
    Apple
    OIDC
  }

  type PasswordLimitsType {
    minLength: Int!
    maxLength: Int!
  }

  type CredentialsRequirementType {
    password: PasswordLimitsType!
  }

  type ServerConfigType {
    version: String!
    baseUrl: String!
    name: String!
    features: [ServerFeature!]!
    type: ServerDeploymentType!
    initialized: Boolean!
    calendarProviders: [CalendarProviderType!]!
    credentialsRequirement: CredentialsRequirementType!
    oauthProviders: [OAuthProviderType!]!
  }

  type UserQuotaHumanReadable {
    name: String!
    blobLimit: String!
    storageQuota: String!
    historyPeriod: String!
    memberLimit: String!
  }

  type UserQuotaType {
    name: String!
    blobLimit: Float!
    storageQuota: Float!
    historyPeriod: Float!
    memberLimit: Int!
    humanReadable: UserQuotaHumanReadable!
  }

  type UserQuotaUsageType {
    storageQuota: Float!
  }

  type UserType {
    id: ID!
    name: String!
    email: String!
    emailVerified: Boolean!
    avatarUrl: String
    hasPassword: Boolean
    features: [FeatureType!]!
    quota: UserQuotaType!
    quotaUsage: UserQuotaUsageType!
  }

  type WorkspaceType {
    id: ID!
    public: Boolean!
    createdAt: DateTime!
    initialized: Boolean!
    team: Boolean!
    owner: UserType
  }

  type Query {
    serverConfig: ServerConfigType!
    currentUser: UserType
    workspaces: [WorkspaceType!]!
    workspace(id: String!): WorkspaceType
    appConfig: JSON
    user(email: String!): UserType
  }

  type Mutation {
    createWorkspace: WorkspaceType!
    deleteWorkspace(id: String!): Boolean!
  }
`;

function mosaicQuota() {
  return {
    name: 'Mosaic',
    blobLimit: 100 * 1024 * 1024,
    storageQuota: 100 * 1024 * 1024 * 1024,
    historyPeriod: 7 * 24 * 60 * 60 * 1000,
    memberLimit: 10_000,
    humanReadable: {
      name: 'Mosaic',
      blobLimit: '100MB',
      storageQuota: '100GB',
      historyPeriod: '7 days',
      memberLimit: '10000',
    },
  };
}

function gqlUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
    hasPassword: true,
    features: user.features,
    quota: mosaicQuota(),
    quotaUsage: { storageQuota: 0 },
  };
}

function toGraphQLError(error: unknown): GraphQLError {
  const unwrapped = unwrapError(error);
  if (unwrapped instanceof AppError) {
    return new GraphQLError(unwrapped.message, {
      extensions: {
        ...(unwrapped.toJSON() as unknown as Record<string, unknown>),
      },
      originalError: unwrapped,
    });
  }
  if (unwrapped instanceof GraphQLError) {
    return unwrapped;
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

function unwrapError(error: unknown): unknown {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof GraphQLError && error.originalError) {
    return unwrapError(error.originalError);
  }
  if (error instanceof Error && error.cause) {
    return unwrapError(error.cause);
  }
  return error;
}

function gqlWorkspace(
  workspace: {
    id: string;
    isPublic: boolean;
    createdAt: Date;
    initialized: boolean;
    team: boolean;
    enableSharing: boolean;
    enableUrlPreview: boolean;
    enableAi: boolean;
  },
  owner: ReturnType<typeof gqlUser> | null
) {
  return {
    id: workspace.id,
    public: workspace.isPublic,
    createdAt: workspace.createdAt,
    initialized: workspace.initialized,
    team: workspace.team,
    enableSharing: workspace.enableSharing,
    enableUrlPreview: workspace.enableUrlPreview,
    enableAi: workspace.enableAi,
    owner,
  };
}

export const graphqlPlugin = fp<{
  auth: AuthService;
  workspaces: WorkspaceService;
  members: MembershipService;
  shares: ShareService;
  comments: CommentService;
  blobs: BlobService;
  docs: DocService;
  sso: SsoService;
  search: SearchService;
  ai: AiGatewayService;
  audit: AuditService;
  policy: SecurityPolicyService;
  config: AppConfig;
}>(
  async (app, opts) => {
    const blob = blobResolvers({
      auth: opts.auth,
      blobs: opts.blobs,
      docs: opts.docs,
      requestOf: httpRequest,
    });
    const members = membersResolvers({
      auth: opts.auth,
      workspaces: opts.workspaces,
      members: opts.members,
      requestOf: httpRequest,
    });
    const share = shareResolvers({
      auth: opts.auth,
      shares: opts.shares,
      requestOf: httpRequest,
    });
    const comments = commentsResolvers({
      auth: opts.auth,
      comments: opts.comments,
      blobs: opts.blobs,
      publicUrl: opts.config.MOSAIC_PUBLIC_URL,
      requestOf: httpRequest,
    });
    const platform = platformResolvers({
      auth: opts.auth,
      workspaces: opts.workspaces,
      search: opts.search,
      ai: opts.ai,
      audit: opts.audit,
      policy: opts.policy,
      requestOf: httpRequest,
    });
    const schema = createSchema({
      typeDefs: [
        typeDefs,
        blobTypeDefs,
        membersTypeDefs,
        shareTypeDefs,
        commentsTypeDefs,
        platformTypeDefs,
      ],
      resolvers: {
        DateTime,
        JSON: JSONScalar,
        JSONObject,
        SafeInt: blob.SafeInt,
        Upload: blob.Upload,
        Query: {
          serverConfig: async () => ({
            version: opts.config.MOSAIC_COMPAT_VERSION,
            baseUrl: opts.config.MOSAIC_PUBLIC_URL,
            name: opts.config.MOSAIC_SERVER_NAME,
            features: serverConfigFeatures(
              opts.sso,
              opts.ai,
              opts.config.MOSAIC_FEATURES
            ),
            type: 'Selfhosted',
            initialized: await opts.auth.isInitialized(),
            calendarProviders: [],
            credentialsRequirement: {
              password: {
                minLength: opts.config.PASSWORD_MIN_LENGTH,
                maxLength: opts.config.PASSWORD_MAX_LENGTH,
              },
            },
            oauthProviders: serverConfigOauthProviders(opts.sso),
          }),
          currentUser: async (
            _root: unknown,
            _args: unknown,
            ctx: { request?: FastifyRequest }
          ) => {
            const user = await opts.auth.getUser(
              httpRequest(ctx)?.authSession ?? null
            );
            if (!user) {
              return null;
            }
            return {
              ...gqlUser(user),
              hasPassword: await opts.auth.hasPassword(user),
            };
          },
          workspaces: async (
            _root: unknown,
            _args: unknown,
            ctx: { request?: FastifyRequest }
          ) => {
            const user = await opts.auth.getUser(
              httpRequest(ctx)?.authSession ?? null
            );
            const list = await opts.workspaces.list(user);
            return Promise.all(
              list.map(async workspace =>
                gqlWorkspace(
                  workspace,
                  await opts.workspaces
                    .ownerOf(workspace.id)
                    .then(owner => (owner ? gqlUser(owner) : null))
                )
              )
            );
          },
          workspace: async (
            _root: unknown,
            args: { id: string },
            ctx: { request?: FastifyRequest }
          ) => {
            try {
              const user = await opts.auth.requireUser(
                httpRequest(ctx)?.authSession ?? null
              );
              const workspace = await opts.workspaces.get(user, args.id);
              return gqlWorkspace(
                workspace,
                await opts.workspaces
                  .ownerOf(workspace.id)
                  .then(owner => (owner ? gqlUser(owner) : null))
              );
            } catch (error) {
              throw toGraphQLError(error);
            }
          },
          appConfig: () => {
            app.log.info({ op: 'appConfig' }, 'compat.stub');
            return {};
          },
          user: async (_root: unknown, _args: { email: string }) => {
            throw toGraphQLError(errors.accessDenied());
          },
          ...members.Query,
          ...platform.Query,
        },
        Mutation: {
          createWorkspace: async (
            _root: unknown,
            _args: unknown,
            ctx: { request?: FastifyRequest }
          ) => {
            try {
              const user = await opts.auth.requireUser(
                httpRequest(ctx)?.authSession ?? null
              );
              const workspace = await opts.workspaces.create(user);
              return gqlWorkspace(workspace, gqlUser(user));
            } catch (error) {
              throw toGraphQLError(error);
            }
          },
          deleteWorkspace: async (
            _root: unknown,
            args: { id: string },
            ctx: { request?: FastifyRequest }
          ) => {
            try {
              const user = await opts.auth.requireUser(
                httpRequest(ctx)?.authSession ?? null
              );
              return await opts.workspaces.delete(user, args.id);
            } catch (error) {
              throw toGraphQLError(error);
            }
          },
          ...blob.Mutation,
          ...members.Mutation,
          ...share.Mutation,
          ...comments.Mutation,
          ...platform.Mutation,
        },
        UserType: {
          ...platform.UserType,
        },
        WorkspaceType: {
          ...blob.WorkspaceType,
          ...members.WorkspaceType,
          ...share.WorkspaceType,
          ...comments.WorkspaceType,
          ...platform.WorkspaceType,
        },
      },
    });

    const yoga = createYoga({
      schema: schema as GraphQLSchema,
      graphqlEndpoint: '/graphql',
      landingPage: false,
      batching: true,
      context: () => {
        const request = graphqlRequest.getStore();
        return request ? { request } : {};
      },
      maskedErrors: {
        maskError(error) {
          const original =
            error instanceof GraphQLError
              ? (error.originalError ?? error)
              : error;
          return toGraphQLError(original);
        },
      },
      logging: {
        debug: (...args) => app.log.debug(args[0]),
        info: (...args) => app.log.info(args[0]),
        warn: (...args) => app.log.warn(args[0]),
        error: (...args) => app.log.error(args[0]),
      },
    });

    app.addContentTypeParser(
      'multipart/form-data',
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      }
    );

    app.route({
      url: '/graphql',
      method: ['GET', 'POST', 'OPTIONS'],
      bodyLimit: Math.max(1_048_576, opts.config.BLOB_MAX_BYTES),
      handler: async (request, reply) => {
        return graphqlRequest.run(request, async () => {
          const url = `http://${request.headers.host ?? '127.0.0.1'}${request.url}`;
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers)) {
            if (typeof value === 'string') {
              headers.set(key, value);
            }
          }
          const init: RequestInit & { duplex?: 'half' } = {
            method: request.method,
            headers,
          };
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            const contentType = headers.get('content-type') ?? '';
            if (contentType.includes('multipart/form-data')) {
              init.body = Uint8Array.from(request.body as Buffer);
            } else {
              if (!headers.has('content-type')) {
                headers.set('content-type', 'application/json');
              }
              init.body = JSON.stringify(request.body ?? {});
            }
          }
          const response = await yoga.fetch(url, init);
          for (const [key, value] of response.headers.entries()) {
            void reply.header(key, value);
          }
          reply.status(response.status);
          return reply.send(Buffer.from(await response.arrayBuffer()));
        });
      },
    });
  },
  { name: 'mosaic-graphql' }
);
