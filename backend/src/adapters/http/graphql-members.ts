import type { FastifyRequest } from 'fastify';

import type { AuthService } from '../../application/auth-service.js';
import type { MembershipService } from '../../application/membership-service.js';
import type { WorkspaceService } from '../../application/workspace-service.js';
import { errors } from '../../domain/errors.js';
import type { User } from '../../domain/identity.js';
import { toGraphQLError } from './graphql-error.js';

export const membersTypeDefs = /* GraphQL */ `
  enum Permission {
    Owner
    Admin
    Collaborator
    External
  }

  enum WorkspaceMemberStatus {
    Accepted
    AllocatingSeat
    NeedMoreSeat
    NeedMoreSeatAndReview
    Pending
    UnderReview
  }

  enum WorkspaceInviteLinkExpireTime {
    OneDay
    ThreeDays
    OneWeek
    OneMonth
  }

  type InviteResult {
    email: String!
    inviteId: String
    error: JSON
  }

  type InviteLink {
    link: String!
    expireTime: DateTime!
  }

  type WorkspaceUserType {
    id: String!
    name: String!
    email: String!
    avatarUrl: String
  }

  type InvitationWorkspaceType {
    id: ID!
    name: String!
    avatar: String!
  }

  type InvitationType {
    workspace: InvitationWorkspaceType!
    user: WorkspaceUserType!
    invitee: WorkspaceUserType!
    status: WorkspaceMemberStatus
  }

  type InviteUserType {
    id: ID!
    name: String
    email: String
    avatarUrl: String
    emailVerified: Boolean
    hasPassword: Boolean
    createdAt: DateTime
    disabled: Boolean
    inviteId: String!
    permission: Permission!
    role: Permission!
    status: WorkspaceMemberStatus!
  }

  type WorkspacePermissions {
    Workspace_Administrators_Manage: Boolean!
    Workspace_Blobs_Manage: Boolean!
    Workspace_Blobs_Upload: Boolean!
    Workspace_Copilot: Boolean!
    Workspace_CreateDoc: Boolean!
    Workspace_Delete: Boolean!
    Workspace_Organize_Read: Boolean!
    Workspace_Payment_Manage: Boolean!
    Workspace_Preview: Boolean!
    Workspace_Properties_Create: Boolean!
    Workspace_Properties_Delete: Boolean!
    Workspace_Properties_Read: Boolean!
    Workspace_Properties_Update: Boolean!
    Workspace_Read: Boolean!
    Workspace_Settings_Read: Boolean!
    Workspace_Settings_Update: Boolean!
    Workspace_Sync: Boolean!
    Workspace_TransferOwner: Boolean!
    Workspace_Users_Manage: Boolean!
    Workspace_Users_Read: Boolean!
  }

  input UpdateWorkspaceInput {
    id: ID!
    public: Boolean
    enableAi: Boolean
    enableSharing: Boolean
    enableUrlPreview: Boolean
    enableDocEmbedding: Boolean
  }

  extend type WorkspaceType {
    memberCount: Int!
    members(query: String, skip: Int, take: Int): [InviteUserType!]!
    inviteLink: InviteLink
    enableSharing: Boolean!
    enableUrlPreview: Boolean!
    enableAi: Boolean!
    permissions: WorkspacePermissions!
  }

  extend type Query {
    getInviteInfo(inviteId: String!): InvitationType!
  }

  extend type Mutation {
    inviteMembers(workspaceId: String!, emails: [String!]!): [InviteResult!]!
    acceptInviteById(
      workspaceId: String
      inviteId: String!
      sendAcceptMail: Boolean
    ): Boolean!
    revokeMember(workspaceId: String!, userId: String!): Boolean!
    leaveWorkspace(
      workspaceId: String!
      sendLeaveMail: Boolean
      workspaceName: String
    ): Boolean!
    createInviteLink(
      workspaceId: String!
      expireTime: WorkspaceInviteLinkExpireTime!
    ): InviteLink!
    revokeInviteLink(workspaceId: String!): Boolean!
    grantMember(
      workspaceId: String!
      userId: String!
      permission: Permission!
    ): Boolean!
    approveMember(workspaceId: String!, userId: String!): Boolean!
    updateWorkspace(input: UpdateWorkspaceInput!): WorkspaceType!
  }
`;

function gqlMember(member: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean | null;
  permission: string;
  role: string;
  inviteId: string;
  status: string;
  createdAt: Date | null;
}) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    avatarUrl: member.avatarUrl,
    emailVerified: member.emailVerified,
    hasPassword: true,
    createdAt: member.createdAt,
    disabled: false,
    inviteId: member.inviteId,
    permission: member.permission,
    role: member.role,
    status: member.status,
  };
}

export function membersResolvers(opts: {
  auth: AuthService;
  workspaces: WorkspaceService;
  members: MembershipService;
  requestOf: (ctx: { request?: FastifyRequest }) => FastifyRequest | undefined;
}) {
  const userOf = async (ctx: { request?: FastifyRequest }): Promise<User> =>
    opts.auth.requireUser(opts.requestOf(ctx)?.authSession ?? null);

  return {
    Query: {
      getInviteInfo: async (
        _root: unknown,
        args: { inviteId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.getInviteInfo(user, args.inviteId);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    WorkspaceType: {
      memberCount: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.memberCount(user, parent.id);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      members: async (
        parent: { id: string },
        args: {
          query?: string | null;
          skip?: number | null;
          take?: number | null;
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const result = await opts.members.listMembers(user, parent.id, {
            ...(args.query ? { query: args.query } : {}),
            ...(args.skip != null ? { skip: args.skip } : {}),
            ...(args.take != null ? { take: args.take } : {}),
          });
          return result.members.map(gqlMember);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      inviteLink: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const link = await opts.members.getInviteLinkSnapshot(
            user,
            parent.id
          );
          if (!link) {
            return null;
          }
          return { link: link.link, expireTime: new Date(link.expireTime) };
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      enableSharing: (parent: { enableSharing?: boolean }) =>
        parent.enableSharing ?? true,
      enableUrlPreview: (parent: { enableUrlPreview?: boolean }) =>
        parent.enableUrlPreview ?? false,
      enableAi: (parent: { enableAi?: boolean }) => parent.enableAi ?? false,
      permissions: async (
        parent: { id: string },
        _args: unknown,
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const access = await opts.members.accessSnapshot(user, parent.id);
          return access.permissions;
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
    Mutation: {
      inviteMembers: async (
        _root: unknown,
        args: { workspaceId: string; emails: string[] },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.inviteMembers(
            user,
            args.workspaceId,
            args.emails
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      acceptInviteById: async (
        _root: unknown,
        args: { workspaceId?: string | null; inviteId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.acceptInvite(
            user,
            args.inviteId,
            args.workspaceId
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      revokeMember: async (
        _root: unknown,
        args: { workspaceId: string; userId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.revokeMember(user, args.workspaceId, args.userId);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      leaveWorkspace: async (
        _root: unknown,
        args: { workspaceId: string; sendLeaveMail?: boolean | null },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.leaveWorkspace(
            user,
            args.workspaceId,
            args.sendLeaveMail
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      createInviteLink: async (
        _root: unknown,
        args: { workspaceId: string; expireTime: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.createInviteLink(
            user,
            args.workspaceId,
            args.expireTime
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      revokeInviteLink: async (
        _root: unknown,
        args: { workspaceId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.revokeInviteLink(user, args.workspaceId);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      grantMember: async (
        _root: unknown,
        args: { workspaceId: string; userId: string; permission: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.grantMember(
            user,
            args.workspaceId,
            args.userId,
            args.permission
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      approveMember: async (
        _root: unknown,
        args: { workspaceId: string; userId: string },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          return opts.members.approveMember(
            user,
            args.workspaceId,
            args.userId
          );
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
      updateWorkspace: async (
        _root: unknown,
        args: {
          input: {
            id: string;
            public?: boolean | null;
            enableAi?: boolean | null;
            enableSharing?: boolean | null;
            enableUrlPreview?: boolean | null;
          };
        },
        ctx: { request?: FastifyRequest }
      ) => {
        try {
          const user = await userOf(ctx);
          const patch = {
            ...(args.input.public != null
              ? { isPublic: args.input.public }
              : {}),
            ...(args.input.enableAi != null
              ? { enableAi: args.input.enableAi }
              : {}),
            ...(args.input.enableSharing != null
              ? { enableSharing: args.input.enableSharing }
              : {}),
            ...(args.input.enableUrlPreview != null
              ? { enableUrlPreview: args.input.enableUrlPreview }
              : {}),
          };
          if (Object.keys(patch).length === 0) {
            throw errors.badRequest('No workspace fields to update.');
          }
          const workspace = await opts.workspaces.update(
            user,
            args.input.id,
            patch
          );
          const owner = await opts.workspaces.ownerOf(workspace.id);
          return {
            id: workspace.id,
            public: workspace.isPublic,
            createdAt: workspace.createdAt,
            initialized: workspace.initialized,
            team: workspace.team,
            enableSharing: workspace.enableSharing,
            enableUrlPreview: workspace.enableUrlPreview,
            enableAi: workspace.enableAi,
            owner: owner
              ? {
                  id: owner.id,
                  name: owner.name,
                  email: owner.email,
                  emailVerified: owner.emailVerified,
                  avatarUrl: owner.avatarUrl,
                  hasPassword: true,
                  features: owner.features,
                }
              : null,
          };
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    },
  };
}
