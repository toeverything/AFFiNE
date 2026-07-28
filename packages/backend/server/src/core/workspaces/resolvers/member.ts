import { Logger } from '@nestjs/common';
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
import { WorkspaceMemberSource, WorkspaceMemberStatus } from '@prisma/client';
import { nanoid } from 'nanoid';

import {
  ActionForbidden,
  ActionForbiddenOnNonTeamWorkspace,
  AlreadyInSpace,
  AuthenticationRequired,
  Cache,
  CanNotRevokeYourself,
  Config,
  EventBus,
  getRequestTrackerId,
  InvalidInvitation,
  isValidCacheTtl,
  mapAnyError,
  MemberNotFoundInSpace,
  NoMoreSeat,
  OwnerCanNotLeaveWorkspace,
  QueryTooLong,
  RequestMutex,
  SpaceAccessDenied,
  Throttle,
  TooManyRequest,
  URLHelper,
  UserNotFound,
} from '../../../base';
import type { GraphqlContext } from '../../../base/graphql';
import { Models, type WorkspaceUserCompat } from '../../../models';
import { CurrentUser, Public } from '../../auth';
import { BackendRuntimeProvider } from '../../backend-runtime';
import { containsUrlOrDomain } from '../../content-policy';
import {
  PermissionAccess,
  WorkspacePolicyService,
  WorkspaceRole,
} from '../../permission';
import { QuotaService } from '../../quota';
import { UserType } from '../../user';
import { validators } from '../../utils/validators';
import {
  canUserExecuteLimitedActions,
  getAbuseRequestSource,
  InviteQuotaAssertService,
} from '../abuse';
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
  private readonly logger = new Logger(WorkspaceMemberResolver.name);

  constructor(
    private readonly cache: Cache,
    private readonly event: EventBus,
    private readonly url: URLHelper,
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    private readonly mutex: RequestMutex,
    private readonly policy: WorkspacePolicyService,
    private readonly workspaceService: WorkspaceService,
    private readonly quota: QuotaService,
    private readonly config: Config,
    private readonly inviteQuota: InviteQuotaAssertService,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  private async assertCanInviteOrShare(
    userId: string,
    context: {
      workspaceId: string;
      action: 'createInviteLink';
    }
  ) {
    if (await this.runtime.isInviteAbuseUserQuarantinedOrBanned(userId)) {
      this.logger.warn('Share action blocked for quarantined actor', {
        userId,
        ...context,
      });
      throw new ActionForbidden(
        'This feature is temporarily unavailable for you.'
      );
    }
    if (
      await this.runtime.isInviteAbuseWorkspaceQuarantined(context.workspaceId)
    ) {
      this.logger.warn('Share action blocked for quarantined workspace', {
        userId,
        ...context,
      });
      throw new ActionForbidden(
        'This feature is temporarily unavailable for you.'
      );
    }
    // Member invites are owned by native quota; this guard stays for invite links until share/link actions migrate.
    const user = await this.models.user.get(userId);
    const newAccountAgeMs = this.config.auth.newAccountShareActionDelay * 1000;
    if (!user || !canUserExecuteLimitedActions(user, newAccountAgeMs)) {
      this.logger.warn('Share action blocked for new account', {
        userId,
        email: user?.email,
        createdAt: user?.createdAt,
        accountAgeMs: user ? Date.now() - user.createdAt.getTime() : null,
        minimumAccountAgeMs: newAccountAgeMs,
        ...context,
      });
      throw new ActionForbidden(
        'This feature is temporarily unavailable for you.'
      );
    }
  }

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

    // lock to prevent concurrent invite
    const lockFlag = `invite:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest();
    }

    const admission = await this.inviteQuota.assertWorkspaceInviteQuota({
      actorUserId: me.id,
      workspaceId,
      requestId: getRequestTrackerId(context.req),
      targetCount: candidates.length,
      targetDomains: aggregateTargetDomains(candidates),
      source: getAbuseRequestSource(context.req, this.config),
    });
    const quota = await this.quota.getWorkspaceSeatQuota(workspaceId);
    const isTeam = await this.workspaceService.isTeamWorkspace(workspaceId);
    const successfulCandidates: InviteCandidate[] = [];
    let reservationSettled = false;

    try {
      for (const candidate of candidates) {
        try {
          let target = candidate.target;
          if (!target) {
            target = await this.models.user.create({
              email: candidate.normalizedEmail,
              registered: false,
            });
          }

          const existingMember = await this.models.workspaceUser.get(
            workspaceId,
            target.id
          );
          if (existingMember) {
            throw new AlreadyInSpace({ spaceId: workspaceId });
          }

          if (!isTeam) {
            const needMoreSeat =
              quota.memberCount + successfulCandidates.length + 1 >
              quota.memberLimit;
            if (needMoreSeat) {
              throw new NoMoreSeat({ spaceId: workspaceId });
            }
          }

          // no need to check quota, directly go allocating seat path
          if (isTeam) {
            const role = await this.models.workspaceUser.set(
              workspaceId,
              target.id,
              WorkspaceRole.Collaborator,
              {
                status: WorkspaceMemberStatus.AllocatingSeat,
                source: WorkspaceMemberSource.Email,
                inviterId: me.id,
              }
            );
            await this.allocateAvailableTeamSeats(
              workspaceId,
              quota.memberLimit
            );
            results[candidate.index] = {
              email: candidate.email,
              inviteId: role.id,
            };
            successfulCandidates.push(candidate);
          } else {
            const role = await this.models.workspaceUser.set(
              workspaceId,
              target.id,
              WorkspaceRole.Collaborator,
              {
                status: WorkspaceMemberStatus.Pending,
                source: WorkspaceMemberSource.Email,
                inviterId: me.id,
              }
            );
            this.event.emit('workspace.members.invite', {
              inviteId: role.id,
              inviterId: me.id,
            });
            results[candidate.index] = {
              email: candidate.email,
              inviteId: role.id,
            };
            successfulCandidates.push(candidate);
          }
        } catch (error) {
          results[candidate.index] = {
            email: candidate.email,
            error: mapAnyError(error),
          };
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
    await this.assertCanInviteOrShare(user.id, {
      workspaceId,
      action: 'createInviteLink',
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

    const quota = await this.quota.getWorkspaceSeatQuota(workspaceId);
    const isTeam = await this.workspaceService.isTeamWorkspace(workspaceId);
    const role = await this.models.workspaceUser.get(workspaceId, userId);

    if (role) {
      if (role.status === WorkspaceMemberStatus.UnderReview) {
        if (isTeam) {
          await this.models.workspaceUser.setStatus(
            workspaceId,
            userId,
            WorkspaceMemberStatus.AllocatingSeat,
            {
              inviterId: me.id,
            }
          );
          await this.allocateAvailableTeamSeats(workspaceId, quota.memberLimit);
        } else {
          if (quota.memberCount >= quota.memberLimit) {
            throw new NoMoreSeat({ spaceId: workspaceId });
          } else {
            await this.models.workspaceUser.setStatus(
              workspaceId,
              userId,
              WorkspaceMemberStatus.Accepted
            );
          }
        }

        this.event.emit('workspace.members.updated', {
          workspaceId,
        });

        await this.workspaceService.sendReviewApprovedNotification(
          role.id,
          me.id
        );
        await this.policy.reconcileWorkspaceQuotaState(workspaceId);
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
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert(
        newRole === WorkspaceRole.Owner
          ? 'Workspace.TransferOwner'
          : 'Workspace.Users.Manage'
      );

    const role = await this.models.workspaceUser.get(workspaceId, userId);

    if (!role) {
      throw new MemberNotFoundInSpace({ spaceId: workspaceId });
    }

    if (newRole === WorkspaceRole.Owner) {
      await this.models.workspaceUser.setOwner(workspaceId, userId);
    } else {
      // non-team workspace can only transfer ownership, but no detailed permission control
      const isTeam = await this.workspaceService.isTeamWorkspace(workspaceId);
      if (!isTeam) {
        throw new ActionForbiddenOnNonTeamWorkspace();
      }

      await this.models.workspaceUser.set(workspaceId, userId, newRole);
      if (role.status !== WorkspaceMemberStatus.Accepted) {
        this.event.emit('workspace.members.updated', {
          workspaceId,
        });
      }
    }

    return true;
  }

  @Throttle('strict')
  @Public()
  @Query(() => InvitationType, {
    description: 'get workspace invitation info',
  })
  async getInviteInfo(
    @CurrentUser() user: UserType | undefined,
    @Args('inviteId') inviteId: string
  ): Promise<InvitationType> {
    const { workspaceId, inviteeUserId, isLink } =
      await this.workspaceService.getInviteInfo(inviteId);
    const workspace = await this.workspaceService.getWorkspaceInfo(workspaceId);
    const owner = await this.models.workspaceUser.getOwner(workspaceId);

    const inviteeId = inviteeUserId || user?.id;
    if (!inviteeId) throw new UserNotFound();
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
    if (userId === me.id) {
      throw new CanNotRevokeYourself();
    }

    const role = await this.models.workspaceUser.get(workspaceId, userId);

    if (!role) {
      throw new MemberNotFoundInSpace({ spaceId: workspaceId });
    }

    await this.ac
      .user(me.id)
      .workspace(workspaceId)
      .assert(
        role.type === WorkspaceRole.Admin
          ? 'Workspace.Administrators.Manage'
          : 'Workspace.Users.Manage'
      );

    await this.models.workspaceUser.delete(workspaceId, userId);

    if (role.status === WorkspaceMemberStatus.UnderReview) {
      await this.workspaceService.sendReviewDeclinedNotification(
        userId,
        workspaceId,
        me.id
      );
    } else if (role.status === WorkspaceMemberStatus.Accepted) {
      this.event.emit('workspace.members.removed', {
        userId,
        workspaceId,
      });
    }

    this.event.emit('workspace.members.updated', {
      workspaceId,
    });
    await this.policy.reconcileWorkspaceQuotaState(workspaceId);

    return true;
  }

  @Mutation(() => Boolean)
  @Public()
  async acceptInviteById(
    @CurrentUser() user: CurrentUser | undefined,
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
      if (user && user.id !== role.userId) {
        throw new InvalidInvitation();
      }

      await this.acceptInvitationByEmail(role);
    } else {
      // invitation by link
      if (!user) {
        throw new AuthenticationRequired();
      }

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
    const role = await this.models.workspaceUser.getActive(
      workspaceId,
      user.id
    );
    if (!role) {
      throw new MemberNotFoundInSpace({ spaceId: workspaceId });
    }
    if (role.type === WorkspaceRole.Owner) {
      throw new OwnerCanNotLeaveWorkspace();
    }

    await this.models.workspaceUser.delete(workspaceId, user.id);
    this.event.emit('workspace.members.leave', {
      workspaceId,
      userId: user.id,
    });

    this.event.emit('workspace.members.updated', {
      workspaceId,
    });
    await this.policy.reconcileWorkspaceQuotaState(workspaceId);

    return true;
  }

  private async acceptInvitationByEmail(role: WorkspaceUserCompat) {
    await this.assertWorkspaceAcceptsMemberChange(role.workspaceId);

    const hasSeat = await this.quota.tryCheckSeat(role.workspaceId, true);

    if (!hasSeat) {
      throw new NoMoreSeat({ spaceId: role.workspaceId });
    }

    await this.models.workspaceUser.setStatus(
      role.workspaceId,
      role.userId,
      WorkspaceMemberStatus.Accepted
    );

    this.event.emit('workspace.members.updated', {
      workspaceId: role.workspaceId,
    });

    await this.workspaceService.sendInvitationAcceptedNotification(
      role.inviterId ??
        (await this.models.workspaceUser.getOwner(role.workspaceId)).id,
      role.id
    );
    await this.policy.reconcileWorkspaceQuotaState(role.workspaceId);
  }

  private async acceptInvitationByLink(
    user: CurrentUser,
    workspaceId: string,
    inviterId: string
  ) {
    await this.assertWorkspaceAcceptsMemberChange(workspaceId);

    let inviter = await this.models.user.getPublicUser(inviterId);
    if (!inviter) {
      inviter = await this.models.workspaceUser.getOwner(workspaceId);
    }

    const role = await this.models.workspaceUser.set(
      workspaceId,
      user.id,
      WorkspaceRole.Collaborator,
      {
        status: WorkspaceMemberStatus.UnderReview,
        source: WorkspaceMemberSource.Link,
        inviterId: inviter.id,
      }
    );

    await this.workspaceService.sendReviewRequestNotification(role.id);
    this.event.emit('workspace.members.updated', { workspaceId });
    return;
  }

  private async assertWorkspaceAcceptsMemberChange(workspaceId: string) {
    const state = await this.policy.getWorkspaceState(workspaceId);
    if (state.isReadonly) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }

  private async allocateAvailableTeamSeats(workspaceId: string, limit: number) {
    if (limit <= 0) return;
    await this.workspaceService.allocateSeats(workspaceId, limit);
  }
}
