import {
  Args,
  Context,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { WorkspaceMemberStatus } from '@prisma/client';
import { nanoid } from 'nanoid';

import {
  ActionForbidden,
  AlreadyInSpace,
  Cache,
  CanNotRevokeYourself,
  Config,
  EventBus,
  getRequestTrackerId,
  InvalidInvitation,
  InvitationAccountMismatch,
  isValidCacheTtl,
  mapAnyError,
  MemberNotFoundInSpace,
  NoMoreSeat,
  OwnerCanNotLeaveWorkspace,
  QueryTooLong,
  SpaceAccessDenied,
  Throttle,
  TooManyRequest,
  URLHelper,
  UserNotFound,
} from '../../../base';
import type { GraphqlContext } from '../../../base/graphql';
import { Models, type WorkspaceUserCompat } from '../../../models';
import { CurrentUser } from '../../auth';
import {
  backendRuntimeErrorCode,
  BackendRuntimeProvider,
} from '../../backend-runtime';
import { containsUrlOrDomain } from '../../content-policy';
import { PermissionAccess, WorkspaceRole } from '../../permission';
import { UserType } from '../../user';
import { validators } from '../../utils/validators';
import { getAbuseRequestSource, InviteQuotaAssertService } from '../abuse';
import { WorkspaceService } from '../service';
import {
  InvitationType,
  InviteLink,
  InviteResult,
  InviteUserType,
  WorkspaceInviteLinkExpireTime,
  WorkspaceType,
} from '../types';

type InviteCandidate = {
  index: number;
  email: string;
  normalizedEmail: string;
  domain: string;
  target?: { id: string };
};

function emailDomain(email: string) {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : '';
}

function aggregateTargetDomains(candidates: InviteCandidate[]) {
  const domains = new Map<string, number>();
  for (const candidate of candidates) {
    domains.set(candidate.domain, (domains.get(candidate.domain) ?? 0) + 1);
  }
  return Array.from(domains, ([domain, count]) => ({ domain, count }));
}

/**
 * Workspace team resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@Resolver(() => WorkspaceType)
export class WorkspaceMemberResolver {
  constructor(
    private readonly cache: Cache,
    private readonly event: EventBus,
    private readonly url: URLHelper,
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    private readonly workspaceService: WorkspaceService,
    private readonly config: Config,
    private readonly inviteQuota: InviteQuotaAssertService,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  private async assertWorkspaceNameCanInvite(workspaceId: string) {
    const workspace = await this.workspaceService.getWorkspaceInfo(workspaceId);
    if (containsUrlOrDomain(workspace.name)) {
      throw new ActionForbidden(
        'Workspace names containing links or domains cannot be used to invite members.'
      );
    }
  }

  @ResolveField(() => UserType, {
    description: 'Owner of workspace',
    complexity: 2,
  })
  async owner(@Parent() workspace: WorkspaceType) {
    return this.models.workspaceUser.getOwner(workspace.id);
  }

  @ResolveField(() => Int, {
    description: 'member count of workspace',
    complexity: 2,
  })
  memberCount(@Parent() workspace: WorkspaceType) {
    return this.models.workspaceUser.count(workspace.id);
  }

  @ResolveField(() => [InviteUserType], {
    description: 'Members of workspace',
    complexity: 2,
  })
  async members(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('query', { type: () => String, nullable: true }) query?: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Users.Read');

    if (query) {
      if (query.length > 255) {
        throw new QueryTooLong({ max: 255 });
      }

      const list = await this.models.workspaceUser.search(workspace.id, query, {
        offset: skip ?? 0,
        first: take ?? 8,
      });

      return list.map(({ status, type, user }) => ({
        ...user,
        permission: Number(type),
        role: Number(type),
        inviteId: user?.id ?? '',
        status,
      }));
    } else {
      const [list] = await this.models.workspaceUser.paginate(workspace.id, {
        offset: skip ?? 0,
        first: take ?? 8,
      });

      return list.map(({ status, type, user }) => ({
        ...user,
        permission: Number(type),
        role: Number(type),
        inviteId: user?.id ?? '',
        status,
      }));
    }
  }

  @Mutation(() => [InviteResult])
  async inviteMembers(
    @CurrentUser() me: CurrentUser,
    @Context() context: GraphqlContext,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'emails', type: () => [String] }) emails: string[]
  ): Promise<InviteResult[]> {
    await this.ac
      .user(me.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');
    await this.assertWorkspaceNameCanInvite(workspaceId);

    if (emails.length > 512) {
      throw new TooManyRequest();
    }

    const results: InviteResult[] = emails.map(email => ({ email }));
    const candidates: InviteCandidate[] = [];
    const seen = new Set<string>();
    for (const [index, email] of emails.entries()) {
      try {
        const normalizedEmail = email.trim().toLowerCase();
        validators.assertValidEmail(normalizedEmail);
        if (seen.has(normalizedEmail)) {
          throw new ActionForbidden('Duplicate invite email.');
        }
        seen.add(normalizedEmail);

        const target = await this.models.user.getUserByEmail(normalizedEmail);
        if (target) {
          const originRecord = await this.models.workspaceUser.get(
            workspaceId,
            target.id
          );
          if (originRecord) {
            throw new AlreadyInSpace({ spaceId: workspaceId });
          }
        }

        candidates.push({
          index,
          email,
          normalizedEmail,
          domain: emailDomain(normalizedEmail),
          target: target ? { id: target.id } : undefined,
        });
      } catch (error) {
        results[index] = {
          email,
          error: mapAnyError(error),
        };
      }
    }

    if (candidates.length === 0) {
      return results;
    }

    const admission = await this.inviteQuota.assertWorkspaceInviteQuota({
      actorUserId: me.id,
      workspaceId,
      requestId: getRequestTrackerId(context.req),
      targetCount: candidates.length,
      targetDomains: aggregateTargetDomains(candidates),
      source: getAbuseRequestSource(context.req, this.config),
    });
    const successfulCandidates: InviteCandidate[] = [];
    let reservationSettled = false;

    try {
      const seatDecision = await this.runtime.reserveWorkspaceSeatsV1({
        workspaceId,
        actorUserId: me.id,
        targets: candidates.map(candidate => ({
          email: candidate.normalizedEmail,
        })),
      });
      if (!seatDecision.allowed) {
        throw new NoMoreSeat({ spaceId: workspaceId });
      }
      const reservations = new Map(
        seatDecision.reservations.map(reservation => [
          reservation.email,
          reservation,
        ])
      );
      const coveredCandidates = candidates.map(candidate => {
        const reservation = reservations.get(candidate.normalizedEmail);
        if (!reservation) throw new Error('Missing seat reservation');
        return { candidate, reservation };
      });
      for (const { candidate, reservation } of coveredCandidates) {
        results[candidate.index] = {
          email: candidate.email,
          inviteId: reservation.invitationId,
        };
        successfulCandidates.push(candidate);
        if (reservation.status === 'pending') {
          this.event.emit('workspace.members.invite', {
            inviteId: reservation.invitationId,
            inviterId: me.id,
          });
        }
      }

      if (successfulCandidates.length > 0) {
        await this.inviteQuota.commitWorkspaceInviteQuota(
          admission.reservationId,
          {
            targetCount: successfulCandidates.length,
            targetDomains: aggregateTargetDomains(successfulCandidates),
          }
        );
      } else {
        await this.inviteQuota.releaseWorkspaceInviteQuota(
          admission.reservationId
        );
      }
      reservationSettled = true;
    } finally {
      if (!reservationSettled) {
        await this.inviteQuota.releaseWorkspaceInviteQuota(
          admission.reservationId
        );
      }
    }

    this.event.emit('workspace.members.updated', {
      workspaceId,
    });

    return results;
  }

  @ResolveField(() => InviteLink, {
    description: 'invite link for workspace',
    nullable: true,
  })
  async inviteLink(
    @Parent() workspace: WorkspaceType,
    @CurrentUser() user: CurrentUser
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Users.Manage');

    const cacheId = `workspace:inviteLink:${workspace.id}`;
    const id = await this.cache.get<{ inviteId: string }>(cacheId);
    if (id) {
      const expireTime = await this.cache.ttl(cacheId);
      if (isValidCacheTtl(expireTime)) {
        return {
          link: this.url.link(`/invite/${id.inviteId}`),
          expireTime: new Date(Date.now() + expireTime * 1000), // Convert seconds to milliseconds
        };
      }
    }
    return null;
  }

  @Mutation(() => InviteLink)
  async createInviteLink(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('expireTime', { type: () => WorkspaceInviteLinkExpireTime })
    expireTime: WorkspaceInviteLinkExpireTime
  ): Promise<InviteLink> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');
    await this.inviteQuota.assertWorkspaceInviteLinkAllowed({
      actorUserId: user.id,
      workspaceId,
    });
    await this.assertWorkspaceNameCanInvite(workspaceId);

    const cacheWorkspaceId = `workspace:inviteLink:${workspaceId}`;
    const invite = await this.cache.get<{ inviteId: string }>(cacheWorkspaceId);
    if (typeof invite?.inviteId === 'string') {
      const expireTime = await this.cache.ttl(cacheWorkspaceId);
      if (isValidCacheTtl(expireTime)) {
        return {
          link: this.url.link(`/invite/${invite.inviteId}`),
          expireTime: new Date(Date.now() + expireTime * 1000), // Convert seconds to milliseconds
        };
      }
    }

    const inviteId = nanoid();
    const cacheInviteId = `workspace:inviteLinkId:${inviteId}`;
    await this.cache.set(cacheWorkspaceId, { inviteId }, { ttl: expireTime });
    await this.cache.set(
      cacheInviteId,
      { workspaceId, inviterUserId: user.id },
      { ttl: expireTime }
    );
    this.event.emit('workspace.invite_link.created', { workspaceId });
    return {
      link: this.url.link(`/invite/${inviteId}`),
      expireTime: new Date(Date.now() + expireTime),
    };
  }

  @Mutation(() => Boolean)
  async revokeInviteLink(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');

    const cacheId = `workspace:inviteLink:${workspaceId}`;
    const invite = await this.cache.get<{ inviteId: string }>(cacheId);
    const deleted = await this.cache.delete(cacheId);
    if (invite?.inviteId) {
      await this.cache.delete(`workspace:inviteLinkId:${invite.inviteId}`);
    }
    this.event.emit('workspace.invite_link.revoked', { workspaceId });
    return deleted;
  }

  @Mutation(() => Boolean)
  async approveMember(
    @CurrentUser() me: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    await this.ac
      .user(me.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');

    const role = await this.models.workspaceUser.get(workspaceId, userId);

    if (role) {
      if (role.status === WorkspaceMemberStatus.UnderReview) {
        try {
          await this.runtime.activateWorkspaceSeatV1({
            workspaceId,
            actorUserId: me.id,
            targetUserId: userId,
            requireManagePermission: true,
          });
        } catch (error) {
          if (backendRuntimeErrorCode(error) === 'seat_limit') {
            throw new NoMoreSeat({ spaceId: workspaceId });
          }
          throw error;
        }

        this.event.emit('workspace.members.updated', {
          workspaceId,
        });

        await this.workspaceService.sendReviewApprovedNotification(
          role.id,
          me.id
        );
      }
      return true;
    } else {
      throw new MemberNotFoundInSpace({ spaceId: workspaceId });
    }
  }

  @Mutation(() => Boolean)
  async grantMember(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string,
    @Args('permission', { type: () => WorkspaceRole }) newRole: WorkspaceRole
  ) {
    let role: 'member' | 'admin' | 'owner';
    switch (newRole) {
      case WorkspaceRole.External:
        return this.revokeMember(user, workspaceId, userId);
      case WorkspaceRole.Collaborator:
        role = 'member';
        break;
      case WorkspaceRole.Admin:
        role = 'admin';
        break;
      case WorkspaceRole.Owner:
        role = 'owner';
        break;
    }
    try {
      await this.runtime.executeDomainCommandV1({
        command: 'transition_workspace_role',
        actorUserId: user.id,
        workspaceId,
        targetUserId: userId,
        newRole: role,
      });
    } catch (error) {
      if (backendRuntimeErrorCode(error) === 'domain_permission_denied') {
        throw new SpaceAccessDenied({ spaceId: workspaceId });
      }
      throw error;
    }
    this.event.emit('workspace.members.updated', { workspaceId });

    return true;
  }

  @Throttle('strict')
  @Query(() => InvitationType, {
    description: 'get workspace invitation info',
  })
  async getInviteInfo(
    @CurrentUser() user: UserType,
    @Args('inviteId') inviteId: string
  ): Promise<InvitationType> {
    const { workspaceId, inviteeUserId, isLink } =
      await this.workspaceService.getInviteInfo(inviteId);

    if (!isLink && user.id !== inviteeUserId) {
      throw new InvitationAccountMismatch();
    }

    const workspace = await this.workspaceService.getWorkspaceInfo(workspaceId);
    const owner = await this.models.workspaceUser.getOwner(workspaceId);

    const inviteeId = inviteeUserId || user.id;
    const invitee = await this.models.user.getWorkspaceUser(inviteeId);
    if (!invitee) throw new UserNotFound();

    let status: WorkspaceMemberStatus | undefined;
    if (isLink) {
      const invitation = await this.models.workspaceUser.get(
        workspaceId,
        inviteeId
      );
      status = invitation?.status;
    } else {
      const invitation = await this.models.workspaceUser.getById(inviteId);
      status = invitation?.status;
    }

    return { workspace, user: owner, invitee, status };
  }

  @Mutation(() => Boolean)
  async revokeMember(
    @CurrentUser() me: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    let previousState: string;
    try {
      const result = await this.runtime.executeDomainCommandV1({
        command: 'revoke_workspace_member',
        actorUserId: me.id,
        workspaceId,
        targetUserId: userId,
      });
      previousState = String(result.previousState);
    } catch (error) {
      switch (backendRuntimeErrorCode(error)) {
        case 'cannot_revoke_self':
          throw new CanNotRevokeYourself();
        case 'workspace_member_not_found':
          throw new MemberNotFoundInSpace({ spaceId: workspaceId });
        case 'domain_permission_denied':
          throw new SpaceAccessDenied({ spaceId: workspaceId });
      }
      throw error;
    }

    if (previousState === 'waiting_review') {
      await this.workspaceService.sendReviewDeclinedNotification(
        userId,
        workspaceId,
        me.id
      );
    } else if (previousState === 'active') {
      this.event.emit('workspace.members.removed', {
        userId,
        workspaceId,
      });
    }

    this.event.emit('workspace.members.updated', {
      workspaceId,
    });

    return true;
  }

  @Mutation(() => Boolean)
  async acceptInviteById(
    @CurrentUser() user: CurrentUser,
    @Args('inviteId') inviteId: string,
    @Args('workspaceId', { deprecationReason: 'never used', nullable: true })
    _workspaceId: string,
    @Args('sendAcceptMail', {
      nullable: true,
      deprecationReason: 'never used',
    })
    _sendAcceptMail: boolean
  ) {
    const role = await this.models.workspaceUser.getById(inviteId);
    // invitation by email
    if (role) {
      if (user.id !== role.userId) {
        throw new InvitationAccountMismatch();
      }

      await this.acceptInvitationByEmail(role);
    } else {
      // invitation by link
      const invitation = await this.cache.get<{
        workspaceId: string;
        inviterUserId: string;
      }>(`workspace:inviteLinkId:${inviteId}`);

      if (!invitation) {
        throw new InvalidInvitation();
      }

      const role = await this.models.workspaceUser.get(
        invitation.workspaceId,
        user.id
      );

      if (role) {
        // if status is pending, should accept the invitation directly
        if (role.status === WorkspaceMemberStatus.Pending) {
          await this.acceptInvitationByEmail(role);
          return true;
        } else {
          throw new AlreadyInSpace({ spaceId: invitation.workspaceId });
        }
      }
      await this.acceptInvitationByLink(
        user,
        invitation.workspaceId,
        invitation.inviterUserId
      );
      return true;
    }

    return true;
  }

  @Mutation(() => Boolean)
  async leaveWorkspace(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('sendLeaveMail', {
      nullable: true,
      deprecationReason: 'no used anymore',
    })
    _sendLeaveMail?: boolean,
    @Args('workspaceName', {
      nullable: true,
      deprecationReason: 'no longer used',
    })
    _workspaceName?: string
  ) {
    try {
      await this.runtime.executeDomainCommandV1({
        command: 'leave_workspace',
        actorUserId: user.id,
        workspaceId,
      });
    } catch (error) {
      switch (backendRuntimeErrorCode(error)) {
        case 'workspace_member_not_found':
          throw new MemberNotFoundInSpace({ spaceId: workspaceId });
        case 'workspace_owner_cannot_leave':
          throw new OwnerCanNotLeaveWorkspace();
      }
      throw error;
    }
    this.event.emit('workspace.members.leave', {
      workspaceId,
      userId: user.id,
    });

    this.event.emit('workspace.members.updated', {
      workspaceId,
    });

    return true;
  }

  private async acceptInvitationByEmail(role: WorkspaceUserCompat) {
    try {
      await this.runtime.activateWorkspaceSeatV1({
        workspaceId: role.workspaceId,
        actorUserId: role.userId,
        targetUserId: role.userId,
        requireManagePermission: false,
      });
    } catch (error) {
      if (backendRuntimeErrorCode(error) === 'seat_limit') {
        throw new NoMoreSeat({ spaceId: role.workspaceId });
      }
      throw error;
    }

    this.event.emit('workspace.members.updated', {
      workspaceId: role.workspaceId,
    });

    await this.workspaceService.sendInvitationAcceptedNotification(
      role.inviterId ??
        (await this.models.workspaceUser.getOwner(role.workspaceId)).id,
      role.id
    );
  }

  private async acceptInvitationByLink(
    user: CurrentUser,
    workspaceId: string,
    inviterId: string
  ) {
    let inviter = await this.models.user.getPublicUser(inviterId);
    if (!inviter) {
      inviter = await this.models.workspaceUser.getOwner(workspaceId);
    }

    const reserved = await this.runtime.reserveWorkspaceReviewSeatV1({
      workspaceId,
      targetUserId: user.id,
      inviterUserId: inviter.id,
    });
    if (!reserved) throw new NoMoreSeat({ spaceId: workspaceId });
    const role = await this.models.workspaceUser.get(workspaceId, user.id);
    if (!role) {
      throw new MemberNotFoundInSpace({ spaceId: workspaceId });
    }

    await this.workspaceService.sendReviewRequestNotification(role.id);
    this.event.emit('workspace.members.updated', { workspaceId });
    return;
  }
}
