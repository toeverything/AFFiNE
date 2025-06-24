import {
  Args,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import {
  WorkspaceMemberSource,
  WorkspaceMemberStatus,
  WorkspaceUserRole,
} from '@prisma/client';
import { nanoid } from 'nanoid';

import {
  ActionForbiddenOnNonTeamWorkspace,
  AlreadyInSpace,
  AuthenticationRequired,
  Cache,
  CanNotRevokeYourself,
  EventBus,
  InvalidInvitation,
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
import { Models } from '../../../models';
import { CurrentUser, Public } from '../../auth';
import { AccessController, WorkspaceRole } from '../../permission';
import { QuotaService } from '../../quota';
import { UserType } from '../../user';
import { validators } from '../../utils/validators';
import { WorkspaceService } from '../service';
import {
  InvitationType,
  InviteLink,
  InviteResult,
  InviteUserType,
  WorkspaceInviteLinkExpireTime,
  WorkspaceType,
} from '../types';

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
    private readonly ac: AccessController,
    private readonly models: Models,
    private readonly mutex: RequestMutex,
    private readonly workspaceService: WorkspaceService,
    private readonly quota: QuotaService
  ) {}

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

      return list.map(({ id, status, type, user }) => ({
        ...user,
        permission: type,
        inviteId: id,
        status,
      }));
    } else {
      const [list] = await this.models.workspaceUser.paginate(workspace.id, {
        offset: skip ?? 0,
        first: take ?? 8,
      });

      return list.map(({ id, status, type, user }) => ({
        ...user,
        permission: type,
        inviteId: id,
        status,
      }));
    }
  }

  @Mutation(() => [InviteResult])
  async inviteMembers(
    @CurrentUser() me: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'emails', type: () => [String] }) emails: string[]
  ): Promise<InviteResult[]> {
    await this.ac
      .user(me.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');

    if (emails.length > 512) {
      throw new TooManyRequest();
    }

    // lock to prevent concurrent invite
    const lockFlag = `invite:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest();
    }

    const quota = await this.quota.getWorkspaceSeatQuota(workspaceId);
    const isTeam = await this.models.workspace.isTeamWorkspace(workspaceId);

    const results: InviteResult[] = [];

    for (const [idx, email] of emails.entries()) {
      try {
        validators.assertValidEmail(email);
        let target = await this.models.user.getUserByEmail(email);
        if (target) {
          const originRecord = await this.models.workspaceUser.get(
            workspaceId,
            target.id
          );
          // only invite if the user is not already in the workspace
          if (originRecord) {
            throw new AlreadyInSpace({ spaceId: workspaceId });
          }
        } else {
          target = await this.models.user.create({
            email,
            registered: false,
          });
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
          results.push({
            email,
            inviteId: role.id,
          });
        } else {
          const needMoreSeat = quota.memberCount + idx + 1 > quota.memberLimit;
          if (needMoreSeat) {
            throw new NoMoreSeat({ spaceId: workspaceId });
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
            results.push({
              email,
              inviteId: role.id,
            });
          }
        }
      } catch (error) {
        results.push({
          email,
          error: mapAnyError(error),
        });
      }
    }

    this.event.emit('workspace.members.updated', {
      workspaceId,
    });

    return results;
  }

  /**
   * @deprecated
   */
  @Mutation(() => [InviteResult], {
    deprecationReason: 'use [inviteMembers] instead',
  })
  async inviteBatch(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'emails', type: () => [String] }) emails: string[],
    @Args('sendInviteMail', {
      nullable: true,
      deprecationReason: 'never used',
    })
    _sendInviteMail: boolean = false
  ) {
    return this.inviteMembers(user, workspaceId, emails);
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
      if (Number.isSafeInteger(expireTime)) {
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

    const cacheWorkspaceId = `workspace:inviteLink:${workspaceId}`;
    const invite = await this.cache.get<{ inviteId: string }>(cacheWorkspaceId);
    if (typeof invite?.inviteId === 'string') {
      const expireTime = await this.cache.ttl(cacheWorkspaceId);
      if (Number.isSafeInteger(expireTime)) {
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
    return await this.cache.delete(cacheId);
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

    const isTeam = await this.models.workspace.isTeamWorkspace(workspaceId);
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
        } else {
          const quota = await this.quota.getWorkspaceSeatQuota(workspaceId);
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

  /**
   * @deprecated
   */
  @Mutation(() => Boolean, {
    deprecationReason: 'use [revokeMember] instead',
  })
  async revoke(
    @CurrentUser() me: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    return this.revokeMember(me, workspaceId, userId);
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
      throw new SpaceAccessDenied({ spaceId: workspaceId });
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

    return true;
  }

  private async acceptInvitationByEmail(role: WorkspaceUserRole) {
    await this.models.workspaceUser.setStatus(
      role.workspaceId,
      role.userId,
      WorkspaceMemberStatus.Accepted
    );

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
    return;
  }
}
