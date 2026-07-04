import {
  WORKSPACE_MEMBERS_REQUEST_TAKE_MAX,
  type WorkspaceAccessSnapshot,
  type WorkspaceConfigSnapshot,
  type WorkspaceInviteLinkSnapshot,
  type WorkspaceMemberSnapshot,
} from '@affine/realtime';
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import {
  Cache,
  isValidCacheTtl,
  OnEvent,
  QueryTooLong,
  URLHelper,
} from '../../base';
import { Models } from '../../models';
import type { WorkspaceUserCompat } from '../../models/workspace-user-compat';
import type { CurrentUser } from '../auth';
import {
  mapPermissionsToGraphqlPermissions,
  PermissionAccess,
  WorkspaceRole,
} from '../permission';
import { QuotaStateService } from '../quota';
import { registerRealtimeLiveQuery } from '../realtime/provider';
import { RealtimePublisher } from '../realtime/publisher';
import { RealtimeRegistry } from '../realtime/registry';
import {
  realtimeWorkspaceAccessRoom,
  realtimeWorkspaceConfigRoom,
  realtimeWorkspaceInviteLinkRoom,
  realtimeWorkspaceMembersRoom,
} from '../realtime/rooms';

const workspaceInput = z.object({ workspaceId: z.string() }).strict();

function serializeWorkspaceMember(
  row: WorkspaceUserCompat
): WorkspaceMemberSnapshot {
  if (!row.user) {
    throw new Error('Workspace member user is required');
  }
  const role = WorkspaceRole[row.type as WorkspaceRole];
  return {
    ...row.user,
    avatarUrl: row.user.avatarUrl ?? null,
    permission: role,
    role,
    inviteId: row.user.id,
    emailVerified: null,
    status: row.status,
  };
}

@Injectable()
export class WorkspaceAccessRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly quotaState: QuotaStateService,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
  ) {}

  onModuleInit() {
    if (!this.registry) return;

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'workspace.access.get',
        input: workspaceInput,
        handle: async (user, input) => ({
          access: await this.getAccess(user, input.workspaceId),
        }),
      },
      topic: {
        name: 'workspace.access.changed',
        input: workspaceInput,
        authorize: async (user, input) => {
          await this.ac
            .user(user.id)
            .workspace(input.workspaceId)
            .assert('Workspace.Read');
        },
        room: (_user, input) => realtimeWorkspaceAccessRoom(input.workspaceId),
      },
    });
  }

  @OnEvent('workspace.members.updated', { suppressError: true })
  onMembersUpdated({ workspaceId }: Events['workspace.members.updated']) {
    this.publish(workspaceId, 'members-updated');
  }

  @OnEvent('workspace.members.roleChanged', { suppressError: true })
  onMemberRoleChanged({
    workspaceId,
  }: Events['workspace.members.roleChanged']) {
    this.publish(workspaceId, 'member-role-changed');
  }

  @OnEvent('workspace.owner.changed', { suppressError: true })
  onWorkspaceOwnerChanged({ workspaceId }: Events['workspace.owner.changed']) {
    this.publish(workspaceId, 'owner-changed');
  }

  @OnEvent('workspace.quota_state.changed', { suppressError: true })
  onWorkspaceQuotaStateChanged({
    workspaceId,
  }: Events['workspace.quota_state.changed']) {
    this.publish(workspaceId, 'quota-state-changed');
  }

  private async getAccess(
    user: CurrentUser,
    workspaceId: string
  ): Promise<WorkspaceAccessSnapshot> {
    await this.ac.user(user.id).workspace(workspaceId).assert('Workspace.Read');
    const { role, permissions } = await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .permissions();

    return {
      role: role ? WorkspaceRole[role] : WorkspaceRole[WorkspaceRole.External],
      permissions: mapPermissionsToGraphqlPermissions(permissions),
      team: await this.isTeamWorkspace(workspaceId),
    };
  }

  private async isTeamWorkspace(workspaceId: string) {
    const state = await this.quotaState.getWorkspaceQuotaState(workspaceId);
    if (!state?.known) return false;
    return ['team', 'selfhost_team'].includes(state.plan);
  }

  private publish(workspaceId: string, reason: string) {
    this.publisher?.publishChanged(
      'workspace.access.changed',
      { workspaceId },
      reason,
      { room: realtimeWorkspaceAccessRoom(workspaceId) }
    );
  }
}

@Injectable()
export class WorkspaceConfigRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
  ) {}

  onModuleInit() {
    if (!this.registry) return;

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'workspace.config.get',
        input: workspaceInput,
        handle: async (user, input) => ({
          config: await this.getConfig(user, input.workspaceId),
        }),
      },
      topic: {
        name: 'workspace.config.changed',
        input: workspaceInput,
        authorize: async (user, input) => {
          await this.assertRead(user.id, input.workspaceId);
        },
        room: (_user, input) => realtimeWorkspaceConfigRoom(input.workspaceId),
      },
    });
  }

  @OnEvent('workspace.updated', { suppressError: true })
  onWorkspaceUpdated(workspace: Events['workspace.updated']) {
    this.publisher?.publishChanged(
      'workspace.config.changed',
      { workspaceId: workspace.id },
      'workspace-updated',
      { room: realtimeWorkspaceConfigRoom(workspace.id) }
    );
  }

  private async getConfig(
    user: CurrentUser,
    workspaceId: string
  ): Promise<WorkspaceConfigSnapshot> {
    await this.assertRead(user.id, workspaceId);
    const workspace = await this.models.workspace.get(workspaceId);
    return {
      enableAi: Boolean(workspace?.enableAi),
      enableSharing: Boolean(workspace?.enableSharing),
      enableUrlPreview: Boolean(workspace?.enableUrlPreview),
      enableDocEmbedding: Boolean(workspace?.enableDocEmbedding),
    };
  }

  private async assertRead(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .assert('Workspace.Settings.Read');
  }
}

@Injectable()
export class WorkspaceMembersRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly cache: Cache,
    private readonly url: URLHelper,
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    @Optional() private readonly registry?: RealtimeRegistry,
    @Optional() private readonly publisher?: RealtimePublisher
  ) {}

  onModuleInit() {
    if (!this.registry) return;

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'workspace.members.get',
        input: z
          .object({
            workspaceId: z.string(),
            skip: z.number().int().nonnegative().optional(),
            take: z.number().int().nonnegative().optional(),
            query: z.string().optional(),
          })
          .strict(),
        handle: async (user, input) => this.getMembers(user, input),
      },
      topic: {
        name: 'workspace.members.changed',
        input: workspaceInput,
        authorize: async (user, input) => {
          await this.assertMembersRead(user.id, input.workspaceId);
        },
        room: (_user, input) => realtimeWorkspaceMembersRoom(input.workspaceId),
      },
    });

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'workspace.invite-link.get',
        input: workspaceInput,
        handle: async (user, input) => ({
          inviteLink: await this.getInviteLink(user, input.workspaceId),
        }),
      },
      topic: {
        name: 'workspace.invite-link.changed',
        input: workspaceInput,
        authorize: async (user, input) => {
          await this.assertInviteManage(user.id, input.workspaceId);
        },
        room: (_user, input) =>
          realtimeWorkspaceInviteLinkRoom(input.workspaceId),
      },
    });
  }

  @OnEvent('workspace.members.updated', { suppressError: true })
  onMembersUpdated({ workspaceId }: Events['workspace.members.updated']) {
    this.publishMembers(workspaceId, 'members-updated');
  }

  @OnEvent('workspace.members.roleChanged', { suppressError: true })
  onMemberRoleChanged({
    workspaceId,
  }: Events['workspace.members.roleChanged']) {
    this.publishMembers(workspaceId, 'member-role-changed');
  }

  @OnEvent('workspace.owner.changed', { suppressError: true })
  onWorkspaceOwnerChanged({ workspaceId }: Events['workspace.owner.changed']) {
    this.publishMembers(workspaceId, 'owner-changed');
  }

  @OnEvent('workspace.invite_link.created', { suppressError: true })
  onInviteLinkCreated({
    workspaceId,
  }: Events['workspace.invite_link.created']) {
    this.publishInviteLink(workspaceId, 'invite-link-created');
  }

  @OnEvent('workspace.invite_link.revoked', { suppressError: true })
  onInviteLinkRevoked({
    workspaceId,
  }: Events['workspace.invite_link.revoked']) {
    this.publishInviteLink(workspaceId, 'invite-link-revoked');
  }

  @OnEvent('user.updated', { suppressError: true })
  async onUserUpdated(user: Events['user.updated']) {
    const workspaceIds = await this.models.workspaceUser.getUserWorkspaceIds(
      user.id
    );
    for (const workspaceId of workspaceIds) {
      this.publishMembers(workspaceId, 'user-updated');
    }
  }

  private async getMembers(
    user: CurrentUser,
    input: {
      workspaceId: string;
      skip?: number;
      take?: number;
      query?: string;
    }
  ) {
    await this.assertMembersRead(user.id, input.workspaceId);

    const pagination = {
      offset: Math.max(input.skip ?? 0, 0),
      first: Math.min(
        Math.max(input.take ?? 8, 1),
        WORKSPACE_MEMBERS_REQUEST_TAKE_MAX
      ),
    };

    if (input.query) {
      if (input.query.length > 255) {
        throw new QueryTooLong({ max: 255 });
      }
      const members = await this.models.workspaceUser.search(
        input.workspaceId,
        input.query,
        pagination
      );
      return {
        members: members.map(serializeWorkspaceMember),
        memberCount: await this.models.workspaceUser.count(input.workspaceId),
      };
    }

    const [members, memberCount] = await this.models.workspaceUser.paginate(
      input.workspaceId,
      pagination
    );
    return {
      members: members.map(serializeWorkspaceMember),
      memberCount,
    };
  }

  private async getInviteLink(
    user: CurrentUser,
    workspaceId: string
  ): Promise<WorkspaceInviteLinkSnapshot | null> {
    await this.assertInviteManage(user.id, workspaceId);

    const cacheId = `workspace:inviteLink:${workspaceId}`;
    const id = await this.cache.get<{ inviteId: string }>(cacheId);
    if (!id) {
      return null;
    }

    const expireTime = await this.cache.ttl(cacheId);
    if (!isValidCacheTtl(expireTime)) {
      return null;
    }

    return {
      link: this.url.link(`/invite/${id.inviteId}`),
      expireTime: new Date(Date.now() + expireTime * 1000).toISOString(),
    };
  }

  private async assertMembersRead(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .assert('Workspace.Users.Read');
  }

  private async assertInviteManage(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');
  }

  private publishMembers(workspaceId: string, reason: string) {
    this.publisher?.publishChanged(
      'workspace.members.changed',
      { workspaceId },
      reason,
      { room: realtimeWorkspaceMembersRoom(workspaceId) }
    );
  }

  private publishInviteLink(workspaceId: string, reason: string) {
    this.publisher?.publishChanged(
      'workspace.invite-link.changed',
      { workspaceId },
      reason,
      { room: realtimeWorkspaceInviteLinkRoom(workspaceId) }
    );
  }
}
