import {
  isValidEmail,
  normalizeEmail,
  displayNameFromEmail,
} from './crypto.js';
import { errors } from '../domain/errors.js';
import type {
  User,
  WorkspaceMember,
  WorkspaceRole,
} from '../domain/identity.js';
import {
  INVITE_LINK_TTL_MS,
  isInviteLinkExpireTime,
  permissionToRole,
  roleToPermission,
  workspacePermissions,
  type GraphQLPermission,
  type InviteLinkExpireTime,
  type WorkspaceInvitation,
  type WorkspaceInviteLink,
} from '../domain/membership.js';
import type {
  Clock,
  IdentityStore,
  MembershipStore,
  RealtimeHub,
  WorkspaceStore,
} from '../domain/ports.js';
import { WorkspaceService } from './workspace-service.js';
import type { AuditService } from './audit-service.js';
import type { SecurityPolicyService } from './security-policy-service.js';
import type { WebhookService } from './webhook-service.js';

export interface ListedMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean | null;
  permission: GraphQLPermission;
  role: GraphQLPermission;
  inviteId: string;
  status: 'Accepted' | 'Pending' | 'UnderReview';
  createdAt: Date | null;
}

export class MembershipService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly workspaceStore: WorkspaceStore,
    private readonly identity: IdentityStore,
    private readonly membership: MembershipStore,
    private readonly clock: Clock,
    private readonly publicUrl: string,
    private readonly hub?: RealtimeHub,
    private readonly extras: {
      audit?: AuditService;
      policy?: SecurityPolicyService;
      webhooks?: WebhookService;
    } = {}
  ) {}

  async listMembers(
    user: User,
    workspaceId: string,
    opts?: { skip?: number; take?: number; query?: string }
  ): Promise<{ members: ListedMember[]; memberCount: number }> {
    await this.workspaces.requireMember(user, workspaceId);
    const all = await this.collectMembers(workspaceId);
    const query = opts?.query?.trim().toLowerCase();
    const filtered = query
      ? all.filter(
          member =>
            member.email.toLowerCase().includes(query) ||
            member.name.toLowerCase().includes(query)
        )
      : all;
    const skip = Math.max(0, opts?.skip ?? 0);
    const take = Math.min(100, Math.max(1, opts?.take ?? 100));
    return {
      members: filtered.slice(skip, skip + take),
      memberCount: filtered.length,
    };
  }

  async memberCount(user: User, workspaceId: string): Promise<number> {
    await this.workspaces.requireMember(user, workspaceId);
    const accepted = await this.workspaceStore.countMembers(workspaceId);
    const pending = (await this.membership.listInvitations(workspaceId)).filter(
      invite => invite.status === 'Pending' || invite.status === 'UnderReview'
    ).length;
    return accepted + pending;
  }

  async inviteMembers(
    user: User,
    workspaceId: string,
    emails: string[]
  ): Promise<
    Array<{
      email: string;
      inviteId: string | null;
      error: Record<string, unknown> | null;
    }>
  > {
    await this.workspaces.requireAdmin(user, workspaceId);
    const results: Array<{
      email: string;
      inviteId: string | null;
      error: Record<string, unknown> | null;
    }> = [];
    for (const raw of emails) {
      const email = normalizeEmail(raw);
      if (!isValidEmail(email)) {
        results.push({
          email: raw,
          inviteId: null,
          error: errors.invalidEmail().toJSON() as unknown as Record<
            string,
            unknown
          >,
        });
        continue;
      }
      try {
        await this.extras.policy?.assertGuestEmail(workspaceId, email);
      } catch (error) {
        results.push({
          email,
          inviteId: null,
          error: (
            error as { toJSON?: () => Record<string, unknown> }
          ).toJSON?.() ?? {
            name: 'ACTION_FORBIDDEN',
          },
        });
        continue;
      }
      const existingUser = await this.identity.findUserByEmail(email);
      if (existingUser) {
        const member = await this.workspaceStore.getMember(
          workspaceId,
          existingUser.id
        );
        if (member) {
          results.push({
            email,
            inviteId: null,
            error: errors
              .alreadyInSpace(workspaceId)
              .toJSON() as unknown as Record<string, unknown>,
          });
          continue;
        }
      }
      const existing = await this.membership.findInvitationByEmail(
        workspaceId,
        email
      );
      if (existing && existing.status === 'Pending') {
        results.push({ email, inviteId: existing.id, error: null });
        continue;
      }
      const now = this.clock.now();
      const invite = await this.membership.createInvitation({
        id: crypto.randomUUID(),
        workspaceId,
        email,
        inviteeId: existingUser?.id ?? null,
        inviterId: user.id,
        role: 'collaborator',
        status: 'Pending',
        createdAt: now,
        acceptedAt: null,
      });
      results.push({ email, inviteId: invite.id, error: null });
      await this.extras.audit?.record({
        workspaceId,
        actorId: user.id,
        action: 'member.invite',
        targetType: 'invitation',
        targetId: invite.id,
        metadata: { email },
      });
      await this.extras.webhooks?.emit(workspaceId, 'member.invited', {
        email,
        inviteId: invite.id,
      });
    }
    this.emitMembers(workspaceId);
    return results;
  }

  async getInviteInfo(user: User, inviteId: string) {
    const invitation = await this.membership.getInvitation(inviteId);
    if (invitation) {
      return this.inviteInfoFromInvitation(user, invitation);
    }
    const link = await this.membership.getInviteLinkByToken(inviteId);
    if (!link) {
      throw errors.invalidInvitation();
    }
    if (link.expireAt.getTime() <= this.clock.now().getTime()) {
      throw errors.invalidInvitation();
    }
    return this.inviteInfoFromLink(user, link);
  }

  async acceptInvite(
    user: User,
    inviteId: string,
    workspaceId?: string | null
  ): Promise<boolean> {
    const invitation = await this.membership.getInvitation(inviteId);
    if (invitation) {
      if (workspaceId && workspaceId !== invitation.workspaceId) {
        throw errors.invalidInvitation();
      }
      if (invitation.status === 'Accepted') {
        const member = await this.workspaceStore.getMember(
          invitation.workspaceId,
          user.id
        );
        if (member) {
          throw errors.alreadyInSpace(invitation.workspaceId);
        }
      }
      if (invitation.email !== normalizeEmail(user.email)) {
        throw errors.invitationAccountMismatch();
      }
      const existing = await this.workspaceStore.getMember(
        invitation.workspaceId,
        user.id
      );
      if (existing) {
        await this.membership.updateInvitation(invitation.id, {
          status: 'Accepted',
          inviteeId: user.id,
          acceptedAt: this.clock.now(),
        });
        throw errors.alreadyInSpace(invitation.workspaceId);
      }
      const now = this.clock.now();
      await this.workspaceStore.addMember(
        invitation.workspaceId,
        user.id,
        invitation.role,
        now,
        invitation.id
      );
      await this.membership.updateInvitation(invitation.id, {
        status: 'Accepted',
        inviteeId: user.id,
        acceptedAt: now,
      });
      this.emitMembers(invitation.workspaceId);
      this.emitAccess(invitation.workspaceId);
      await this.extras.audit?.record({
        workspaceId: invitation.workspaceId,
        actorId: user.id,
        action: 'member.accept',
        targetType: 'invitation',
        targetId: invitation.id,
      });
      await this.extras.webhooks?.emit(
        invitation.workspaceId,
        'member.accepted',
        {
          userId: user.id,
        }
      );
      return true;
    }

    const link = await this.membership.getInviteLinkByToken(inviteId);
    if (!link || link.expireAt.getTime() <= this.clock.now().getTime()) {
      throw errors.invalidInvitation();
    }
    if (workspaceId && workspaceId !== link.workspaceId) {
      throw errors.invalidInvitation();
    }
    const existing = await this.workspaceStore.getMember(
      link.workspaceId,
      user.id
    );
    if (existing) {
      throw errors.alreadyInSpace(link.workspaceId);
    }
    await this.workspaceStore.addMember(
      link.workspaceId,
      user.id,
      'collaborator',
      this.clock.now(),
      inviteId
    );
    this.emitMembers(link.workspaceId);
    this.emitAccess(link.workspaceId);
    await this.extras.audit?.record({
      workspaceId: link.workspaceId,
      actorId: user.id,
      action: 'member.accept',
      targetType: 'invite_link',
      targetId: inviteId,
    });
    await this.extras.webhooks?.emit(link.workspaceId, 'member.accepted', {
      userId: user.id,
    });
    return true;
  }

  async revokeMember(
    actor: User,
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    const actorMember = await this.workspaces.requireAdmin(actor, workspaceId);
    const target = await this.workspaceStore.getMember(workspaceId, userId);
    if (!target) {
      const pending = (await this.membership.listInvitations(workspaceId)).find(
        invite => invite.inviteeId === userId && invite.status === 'Pending'
      );
      if (pending) {
        await this.membership.deleteInvitation(pending.id);
        this.emitMembers(workspaceId);
        await this.extras.audit?.record({
          workspaceId,
          actorId: actor.id,
          action: 'member.revoke',
          targetType: 'invitation',
          targetId: pending.id,
        });
        return true;
      }
      throw errors.memberNotFoundInSpace(workspaceId);
    }
    if (target.role === 'owner') {
      throw errors.spaceAccessDenied(workspaceId);
    }
    if (target.role === 'admin' && actorMember.role !== 'owner') {
      throw errors.spaceAccessDenied(workspaceId);
    }
    if (target.userId === actor.id) {
      throw errors.actionForbidden(
        'Use leaveWorkspace to leave this workspace.'
      );
    }
    await this.workspaceStore.removeMember(workspaceId, userId);
    this.emitMembers(workspaceId);
    this.emitAccess(workspaceId);
    await this.extras.audit?.record({
      workspaceId,
      actorId: actor.id,
      action: 'member.revoke',
      targetType: 'user',
      targetId: userId,
    });
    return true;
  }

  async leaveWorkspace(
    user: User,
    workspaceId: string,
    sendLeaveMail?: boolean | null
  ): Promise<boolean> {
    if (sendLeaveMail) {
      // Email is not configured; membership is still removed.
    }
    const member = await this.workspaces.requireMember(user, workspaceId);
    if (member.role === 'owner') {
      throw errors.actionForbidden('Workspace owner cannot leave.');
    }
    await this.workspaceStore.removeMember(workspaceId, user.id);
    this.emitMembers(workspaceId);
    this.emitAccess(workspaceId);
    return true;
  }

  async grantMember(
    actor: User,
    workspaceId: string,
    userId: string,
    permission: string
  ): Promise<boolean> {
    const actorMember = await this.workspaces.requireAdmin(actor, workspaceId);
    if (permission === 'Owner') {
      throw errors.actionForbidden('Owner transfer is not supported.');
    }
    let nextRole: Exclude<WorkspaceRole, 'owner'>;
    try {
      nextRole = permissionToRole(permission);
    } catch {
      throw errors.badRequest('Invalid permission.');
    }
    if (nextRole === 'admin' && actorMember.role !== 'owner') {
      throw errors.spaceAccessDenied(workspaceId);
    }
    const target = await this.workspaceStore.getMember(workspaceId, userId);
    if (!target) {
      throw errors.memberNotFoundInSpace(workspaceId);
    }
    if (target.role === 'owner') {
      throw errors.spaceAccessDenied(workspaceId);
    }
    await this.workspaceStore.updateMemberRole(workspaceId, userId, nextRole);
    this.emitMembers(workspaceId);
    this.emitAccess(workspaceId);
    await this.extras.audit?.record({
      workspaceId,
      actorId: actor.id,
      action: 'member.role_change',
      targetType: 'user',
      targetId: userId,
      metadata: { role: nextRole },
    });
    return true;
  }

  async approveMember(
    actor: User,
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    await this.workspaces.requireAdmin(actor, workspaceId);
    const targetUser = await this.identity.findUserById(userId);
    if (!targetUser) {
      throw errors.userNotFound();
    }
    const existing = await this.workspaceStore.getMember(workspaceId, userId);
    if (existing) {
      return true;
    }
    const pending =
      (await this.membership.findInvitationByEmail(
        workspaceId,
        targetUser.email
      )) ??
      (await this.membership.listInvitations(workspaceId)).find(
        invite => invite.inviteeId === userId && invite.status !== 'Accepted'
      );
    if (!pending) {
      throw errors.memberNotFoundInSpace(workspaceId);
    }
    const now = this.clock.now();
    await this.workspaceStore.addMember(
      workspaceId,
      userId,
      pending.role,
      now,
      pending.id
    );
    await this.membership.updateInvitation(pending.id, {
      status: 'Accepted',
      inviteeId: userId,
      acceptedAt: now,
    });
    this.emitMembers(workspaceId);
    this.emitAccess(workspaceId);
    return true;
  }

  async createInviteLink(
    user: User,
    workspaceId: string,
    expireTime: string
  ): Promise<{ link: string; expireTime: Date }> {
    await this.workspaces.requireAdmin(user, workspaceId);
    if (!isInviteLinkExpireTime(expireTime)) {
      throw errors.badRequest('Invalid invite link expire time.');
    }
    const now = this.clock.now();
    const expireAt = new Date(
      now.getTime() + INVITE_LINK_TTL_MS[expireTime as InviteLinkExpireTime]
    );
    const token = crypto.randomUUID();
    await this.membership.upsertInviteLink({
      workspaceId,
      token,
      expireAt,
      createdBy: user.id,
      createdAt: now,
    });
    this.hub?.emit(
      'workspace.invite-link.changed',
      { workspaceId },
      { changed: true, reason: 'created' }
    );
    return {
      link: this.inviteLinkUrl(token),
      expireTime: expireAt,
    };
  }

  async revokeInviteLink(user: User, workspaceId: string): Promise<boolean> {
    await this.workspaces.requireAdmin(user, workspaceId);
    const removed = await this.membership.deleteInviteLink(workspaceId);
    this.hub?.emit(
      'workspace.invite-link.changed',
      { workspaceId },
      { changed: true, reason: 'revoked' }
    );
    return removed;
  }

  async getInviteLinkSnapshot(
    user: User,
    workspaceId: string
  ): Promise<{ link: string; expireTime: string } | null> {
    await this.workspaces.requireMember(user, workspaceId);
    const link = await this.membership.getInviteLink(workspaceId);
    if (!link || link.expireAt.getTime() <= this.clock.now().getTime()) {
      return null;
    }
    return {
      link: this.inviteLinkUrl(link.token),
      expireTime: link.expireAt.toISOString(),
    };
  }

  async accessSnapshot(user: User, workspaceId: string) {
    const member = await this.workspaces.requireMember(user, workspaceId);
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    return {
      role: roleToPermission(member.role),
      permissions: workspacePermissions(member.role),
      team: workspace?.team ?? false,
    };
  }

  async configSnapshot(user: User, workspaceId: string) {
    const workspace = await this.workspaces.get(user, workspaceId);
    return {
      enableAi: workspace.enableAi,
      enableSharing: workspace.enableSharing,
      enableUrlPreview: workspace.enableUrlPreview,
      enableDocEmbedding: false,
    };
  }

  private inviteLinkUrl(token: string): string {
    return `${this.publicUrl.replace(/\/$/, '')}/invite/${token}`;
  }

  private emitMembers(workspaceId: string): void {
    this.hub?.emit(
      'workspace.members.changed',
      { workspaceId },
      { changed: true, reason: 'updated' }
    );
    this.hub?.emit(
      'workspace.quota-state.changed',
      { workspaceId },
      { changed: true }
    );
  }

  private emitAccess(workspaceId: string): void {
    this.hub?.emit(
      'workspace.access.changed',
      { workspaceId },
      { changed: true, reason: 'updated' }
    );
  }

  private async collectMembers(workspaceId: string): Promise<ListedMember[]> {
    const members = await this.workspaceStore.listMembers(workspaceId);
    const listed: ListedMember[] = [];
    for (const member of members) {
      const account = await this.identity.findUserById(member.userId);
      if (!account) {
        continue;
      }
      listed.push(this.fromAccepted(member, account));
    }
    const invites = await this.membership.listInvitations(workspaceId);
    for (const invite of invites) {
      if (invite.status === 'Accepted') {
        continue;
      }
      if (
        invite.inviteeId &&
        listed.some(item => item.id === invite.inviteeId)
      ) {
        continue;
      }
      listed.push(await this.fromInvitation(invite));
    }
    return listed.sort((a, b) => a.email.localeCompare(b.email));
  }

  private fromAccepted(member: WorkspaceMember, account: User): ListedMember {
    const role = roleToPermission(member.role);
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      avatarUrl: account.avatarUrl,
      emailVerified: account.emailVerified,
      permission: role,
      role,
      inviteId: member.inviteId,
      status: 'Accepted',
      createdAt: member.createdAt,
    };
  }

  private async fromInvitation(
    invite: WorkspaceInvitation
  ): Promise<ListedMember> {
    const invitee = invite.inviteeId
      ? await this.identity.findUserById(invite.inviteeId)
      : await this.identity.findUserByEmail(invite.email);
    const role = roleToPermission(invite.role);
    return {
      id: invitee?.id ?? invite.id,
      name: invitee?.name ?? displayNameFromEmail(invite.email),
      email: invitee?.email ?? invite.email,
      avatarUrl: invitee?.avatarUrl ?? null,
      emailVerified: invitee?.emailVerified ?? null,
      permission: role,
      role,
      inviteId: invite.id,
      status: invite.status === 'UnderReview' ? 'UnderReview' : 'Pending',
      createdAt: invite.createdAt,
    };
  }

  private async inviteInfoFromInvitation(
    user: User,
    invitation: WorkspaceInvitation
  ) {
    const workspace = await this.workspaceStore.getWorkspace(
      invitation.workspaceId
    );
    if (!workspace) {
      throw errors.invalidInvitation();
    }
    if (
      invitation.email !== normalizeEmail(user.email) &&
      invitation.inviteeId !== user.id
    ) {
      throw errors.invitationAccountMismatch();
    }
    const inviter = await this.identity.findUserById(invitation.inviterId);
    if (!inviter) {
      throw errors.invalidInvitation();
    }
    const member = await this.workspaceStore.getMember(
      invitation.workspaceId,
      user.id
    );
    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        avatar: '',
      },
      user: {
        id: inviter.id,
        name: inviter.name,
        avatarUrl: inviter.avatarUrl,
        email: inviter.email,
      },
      invitee: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      status: member ? 'Accepted' : invitation.status,
    };
  }

  private async inviteInfoFromLink(user: User, link: WorkspaceInviteLink) {
    const workspace = await this.workspaceStore.getWorkspace(link.workspaceId);
    if (!workspace) {
      throw errors.invalidInvitation();
    }
    const inviter = await this.identity.findUserById(link.createdBy);
    if (!inviter) {
      throw errors.invalidInvitation();
    }
    const member = await this.workspaceStore.getMember(
      link.workspaceId,
      user.id
    );
    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        avatar: '',
      },
      user: {
        id: inviter.id,
        name: inviter.name,
        avatarUrl: inviter.avatarUrl,
        email: inviter.email,
      },
      invitee: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      status: member ? 'Accepted' : 'Pending',
    };
  }
}
