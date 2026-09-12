import type { FastifyRequest } from 'fastify';

import type { AiGatewayService } from '../../application/ai-gateway.js';
import type { AuditService } from '../../application/audit-service.js';
import type { AuthService } from '../../application/auth-service.js';
import type { SearchService } from '../../application/search-service.js';
import type { SecurityPolicyService } from '../../application/security-policy-service.js';
import type { SsoService } from '../../application/sso-service.js';
import type { WorkspaceService } from '../../application/workspace-service.js';
import type {
  CopilotMessageRecord,
  CopilotSessionRecord,
} from '../../domain/ai.js';
import type { AuditEvent } from '../../domain/audit.js';
import type { SecurityPolicy } from '../../domain/security.js';
import { errors } from '../../domain/errors.js';
import type { User } from '../../domain/identity.js';
import { toGraphQLError } from './graphql-error.js';

export const platformTypeDefs = /* GraphQL */ `
  enum SearchTable {
    block
    doc
  }

  enum SearchQueryType {
    all
    boolean
    boost
    exists
    match
  }

  enum SearchQueryOccur {
    must
    must_not
    should
  }

  input SearchQuery {
    type: SearchQueryType!
    field: String
    match: String
    occur: SearchQueryOccur
    boost: Float
    queries: [SearchQuery!]
    query: SearchQuery
  }

  input SearchPagination {
    cursor: String
    limit: Int
    skip: Int
  }

  input SearchHighlight {
    field: String!
    before: String!
    end: String!
  }

  input SearchOptions {
    fields: [String!]!
    highlights: [SearchHighlight!]
    pagination: SearchPagination
  }

  input SearchInput {
    table: SearchTable!
    query: SearchQuery!
    options: SearchOptions!
  }

  input SearchDocsInput {
    keyword: String!
    limit: Int
  }

  type SearchNodeObjectType {
    fields: JSONObject!
    highlights: JSONObject
  }

  type SearchResultPagination {
    count: Int!
    hasMore: Boolean!
    nextCursor: String
  }

  type SearchResultObjectType {
    nodes: [SearchNodeObjectType!]!
    pagination: SearchResultPagination!
  }

  type SearchDocObjectType {
    docId: String!
    title: String!
    blockId: String!
    highlight: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    createdByUser: PublicUserType
    updatedByUser: PublicUserType
  }

  type CopilotQuota {
    limit: SafeInt
    used: SafeInt!
  }

  type StreamObject {
    type: String!
    textDelta: String
    toolCallId: String
    toolName: String
    args: JSON
    result: JSON
  }

  type ChatMessage {
    id: ID!
    role: String!
    content: String
    attachments: [String!]
    scopeSnapshot: JSON
    streamObjects: [StreamObject!]
    createdAt: DateTime!
  }

  type CopilotHistories {
    sessionId: String!
    workspaceId: String!
    docId: String
    parentSessionId: String
    promptName: String!
    action: String
    pinned: Boolean!
    title: String
    messages: [ChatMessage!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Copilot {
    quota: CopilotQuota!
  }

  type AuditLogType {
    id: ID!
    workspaceId: String
    actorId: String
    actorType: String!
    action: String!
    targetType: String
    targetId: String
    metadata: JSON!
    ip: String
    userAgent: String
    createdAt: DateTime!
  }

  type SecurityPolicyType {
    workspaceId: String
    allowedGuestDomains: [String!]!
    blockPublicLinks: Boolean!
    requireSso: Boolean!
    requireSsoDomains: [String!]!
    sessionMaxDurationSec: Int
    updatedAt: DateTime!
  }

  input SecurityPolicyInput {
    allowedGuestDomains: [String!]
    blockPublicLinks: Boolean
    requireSso: Boolean
    requireSsoDomains: [String!]
    sessionMaxDurationSec: Int
  }

  input CreateChatSessionInput {
    workspaceId: String!
    promptName: String!
    docId: String
    pinned: Boolean
    reuseLatestChat: Boolean
  }

  input CreateChatMessageInput {
    sessionId: String!
    content: String
    params: JSON
  }

  extend type UserType {
    copilot: Copilot!
  }

  extend type WorkspaceType {
    search(input: SearchInput!): SearchResultObjectType!
    searchDocs(input: SearchDocsInput!): [SearchDocObjectType!]!
    securityPolicy: SecurityPolicyType!
  }

  extend type Query {
    auditLogs(workspaceId: String, action: String, take: Int): [AuditLogType!]!
    instanceSecurityPolicy: SecurityPolicyType!
  }

  extend type Mutation {
    createCopilotSession(options: CreateChatSessionInput!): String!
    createCopilotSessionWithHistory(
      options: CreateChatSessionInput!
    ): CopilotHistories!
    createCopilotMessage(options: CreateChatMessageInput!): String!
    updateWorkspaceSecurityPolicy(
      workspaceId: String!
      input: SecurityPolicyInput!
    ): SecurityPolicyType!
    updateInstanceSecurityPolicy(
      input: SecurityPolicyInput!
    ): SecurityPolicyType!
  }
`;

function gqlPolicy(policy: SecurityPolicy) {
  return {
    workspaceId: policy.workspaceId,
    allowedGuestDomains: policy.allowedGuestDomains,
    blockPublicLinks: policy.blockPublicLinks,
    requireSso: policy.requireSso,
    requireSsoDomains: policy.requireSsoDomains,
    sessionMaxDurationSec: policy.sessionMaxDurationSec,
    updatedAt: policy.updatedAt,
  };
}

function gqlAudit(event: AuditEvent) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
    ip: event.ip,
    userAgent: event.userAgent,
    createdAt: event.createdAt,
  };
}

function gqlHistory(
  session: CopilotSessionRecord,
  messages: CopilotMessageRecord[]
) {
  return {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    docId: session.docId,
    parentSessionId: null,
    promptName: session.promptName,
    action: null,
    pinned: session.pinned,
    title: session.title,
    messages: messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      attachments: null,
      scopeSnapshot: null,
      streamObjects: null,
      createdAt: message.createdAt,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export interface PlatformGraphqlOpts {
  auth: AuthService;
  workspaces: WorkspaceService;
  search: SearchService;
  ai: AiGatewayService;
  audit: AuditService;
  policy: SecurityPolicyService;
  requestOf: (ctx: { request?: FastifyRequest }) => FastifyRequest | undefined;
}

export function platformResolvers(opts: PlatformGraphqlOpts) {
  const userOf = async (ctx: { request?: FastifyRequest }): Promise<User> =>
    opts.auth.requireUser(opts.requestOf(ctx)?.authSession ?? null);

  const assertAuditAccess = async (user: User, workspaceId?: string | null) => {
    if (user.features.includes('Admin')) {
      return;
    }
    if (!workspaceId) {
      opts.auth.requireInstanceAdmin(user);
      return;
    }
    await opts.workspaces.requireAdmin(user, workspaceId);
  };

  return {
    UserType: {
      copilot: async (parent: { id: string }) => {
        const user = await opts.auth.getUserById(parent.id);
        if (!user) {
          return { quota: { limit: 0, used: 0 } };
        }
        return { quota: await opts.ai.quota(user) };
      },
    },
    WorkspaceType: {
      search: async (
        parent: { id: string },
        args: {
          input: {
            query?: unknown;
            options?: {
              fields?: string[];
              pagination?: { limit?: number; skip?: number };
            };
          };
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await opts.workspaces.requireMember(user, parent.id);
          const result = await opts.search.search(parent.id, args.input);
          return {
            nodes: result.nodes,
            pagination: {
              count: result.count,
              hasMore: result.hasMore,
              nextCursor: result.nextCursor,
            },
          };
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      searchDocs: async (
        parent: { id: string },
        args: { input: { keyword: string; limit?: number | null } },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await opts.workspaces.requireMember(user, parent.id);
          const hits = await opts.search.searchDocs(
            parent.id,
            args.input.keyword,
            args.input.limit ?? 20
          );
          return hits.map(hit => ({
            ...hit,
            createdByUser: null,
            updatedByUser: null,
          }));
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      securityPolicy: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await opts.workspaces.requireMember(user, parent.id);
          return gqlPolicy(await opts.policy.get(parent.id));
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    Query: {
      auditLogs: async (
        _root: unknown,
        args: {
          workspaceId?: string | null;
          action?: string | null;
          take?: number | null;
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await assertAuditAccess(user, args.workspaceId);
          const events = await opts.audit.list({
            ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
            ...(args.action ? { action: args.action } : {}),
            ...(args.take != null ? { take: args.take } : {}),
          });
          return events.map(gqlAudit);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      instanceSecurityPolicy: async (
        _root: unknown,
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          opts.auth.requireInstanceAdmin(user);
          return gqlPolicy(await opts.policy.get(null));
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    Mutation: {
      createCopilotSession: async (
        _root: unknown,
        args: {
          options: {
            workspaceId: string;
            promptName: string;
            docId?: string | null;
            pinned?: boolean | null;
            reuseLatestChat?: boolean | null;
          };
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await opts.workspaces.requireMember(user, args.options.workspaceId);
          const session = await opts.ai.createSession(user, {
            workspaceId: args.options.workspaceId,
            promptName: args.options.promptName,
            ...(args.options.docId ? { docId: args.options.docId } : {}),
            ...(args.options.pinned != null
              ? { pinned: args.options.pinned }
              : {}),
            ...(args.options.reuseLatestChat != null
              ? { reuseLatestChat: args.options.reuseLatestChat }
              : {}),
          });
          return session.id;
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      createCopilotSessionWithHistory: async (
        _root: unknown,
        args: {
          options: {
            workspaceId: string;
            promptName: string;
            docId?: string | null;
            pinned?: boolean | null;
            reuseLatestChat?: boolean | null;
          };
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await opts.workspaces.requireMember(user, args.options.workspaceId);
          const session = await opts.ai.createSession(user, {
            workspaceId: args.options.workspaceId,
            promptName: args.options.promptName,
            ...(args.options.docId ? { docId: args.options.docId } : {}),
            ...(args.options.pinned != null
              ? { pinned: args.options.pinned }
              : {}),
            ...(args.options.reuseLatestChat != null
              ? { reuseLatestChat: args.options.reuseLatestChat }
              : {}),
          });
          const history = await opts.ai.history(session.id);
          return gqlHistory(history.session, history.messages);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      createCopilotMessage: async (
        _root: unknown,
        args: { options: { sessionId: string; content?: string | null } },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const content = args.options.content?.trim();
          if (!content) {
            throw errors.badRequest('Message content is required.');
          }
          const message = await opts.ai.chat(
            user,
            args.options.sessionId,
            content
          );
          return message.id;
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      updateWorkspaceSecurityPolicy: async (
        _root: unknown,
        args: {
          workspaceId: string;
          input: Partial<
            Pick<
              SecurityPolicy,
              | 'allowedGuestDomains'
              | 'blockPublicLinks'
              | 'requireSso'
              | 'requireSsoDomains'
              | 'sessionMaxDurationSec'
            >
          >;
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          await opts.workspaces.requireAdmin(user, args.workspaceId);
          const policy = await opts.policy.update(args.workspaceId, args.input);
          await opts.audit.record({
            workspaceId: args.workspaceId,
            actorId: user.id,
            action: 'security.policy_update',
            targetType: 'workspace',
            targetId: args.workspaceId,
          });
          return gqlPolicy(policy);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      updateInstanceSecurityPolicy: async (
        _root: unknown,
        args: {
          input: Partial<
            Pick<
              SecurityPolicy,
              | 'allowedGuestDomains'
              | 'blockPublicLinks'
              | 'requireSso'
              | 'requireSsoDomains'
              | 'sessionMaxDurationSec'
            >
          >;
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          opts.auth.requireInstanceAdmin(user);
          const policy = await opts.policy.update(null, args.input);
          await opts.audit.record({
            actorId: user.id,
            action: 'security.policy_update',
            targetType: 'instance',
          });
          return gqlPolicy(policy);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
  };
}

export function serverConfigFeatures(
  sso: SsoService,
  ai: AiGatewayService,
  envFlags: string[]
): string[] {
  const features = ['Comment', 'Indexer'];
  if (sso.oauthProviders().length > 0) {
    features.push('OAuth');
  }
  if (ai.enabled) {
    features.push('Copilot');
  }
  for (const flag of envFlags) {
    if (flag === 'Captcha' || flag === 'LocalWorkspace') {
      features.push(flag);
    }
  }
  return features;
}

export function serverConfigOauthProviders(sso: SsoService): string[] {
  return sso.oauthProviders();
}
