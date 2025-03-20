import { Logger } from '@nestjs/common';
import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { WorkspaceMemberStatus } from '@prisma/client';
import { nanoid } from 'nanoid';

import {
  ActionForbiddenOnNonTeamWorkspace,
  Cache,
  EventBus,
  MemberNotFoundInSpace,
  RequestMutex,
  TooManyRequest,
  URLHelper,
} from '../../../base';
import { Models } from '../../../models';
import { CurrentUser } from '../../auth';
import { AccessController, WorkspaceRole } from '../../permission';
import { QuotaService } from '../../quota';
import {
  InviteLink,
  InviteResult,
  WorkspaceInviteLinkExpireTime,
  WorkspaceType,
} from '../types';
import { WorkspaceService } from './service';

/**
 * Workspace team resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@Resolver(() => WorkspaceType)
export class TeamWorkspaceResolver {
  private readonly logger = new Logger(TeamWorkspaceResolver.name);

  constructor(
    private readonly cache: Cache,
    private readonly event: EventBus,
    private readonly url: URLHelper,
    private readonly ac: AccessController,
    private readonly models: Models,
    private readonly quota: QuotaService,
    private readonly mutex: RequestMutex,
    private readonly workspaceService: WorkspaceService
  ) {}

  @ResolveField(() => Boolean, {
    name: 'team',
    description: 'if workspace is team workspace',
    complexity: 2,
  })
  team(@Parent() workspace: WorkspaceType) {
    return this.workspaceService.isTeamWorkspace(workspace.id);
  }

  @Mutation(() => [InviteResult])
  async inviteBatch(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'emails', type: () => [String] }) emails: string[],
    @Args('sendInviteMail', { nullable: true }) sendInviteMail: boolean
  ) {
    await this.ac
      .user(user.id)
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

    const results = [];
    for (const [idx, email] of emails.entries()) {
      const ret: InviteResult = { email, sentSuccess: false, inviteId: null };
      try {
        let target = await this.models.user.getUserByEmail(email);
        if (target) {
          const originRecord = await this.models.workspaceUser.get(
            workspaceId,
            target.id
          );
          // only invite if the user is not already in the workspace
          if (originRecord) continue;
        } else {
          target = await this.models.user.create({
            email,
            registered: false,
          });
        }
        const needMoreSeat = quota.memberCount + idx + 1 > quota.memberLimit;

        const role = await this.models.workspaceUser.set(
          workspaceId,
          target.id,
          WorkspaceRole.Collaborator,
          needMoreSeat
            ? WorkspaceMemberStatus.NeedMoreSeat
            : WorkspaceMemberStatus.Pending
        );
        ret.inviteId = role.id;
        // NOTE: we always send email even seat not enough
        // because at this moment we cannot know whether the seat increase charge was successful
        // after user click the invite link, we can check again and reject if charge failed
        if (sendInviteMail) {
          try {
            await this.workspaceService.sendInviteEmail({
              workspaceId,
              inviteeEmail: target.email,
              inviterUserId: user.id,
              inviteId: role.id,
            });
            ret.sentSuccess = true;
          } catch (e) {
            this.logger.warn(
              `failed to send ${workspaceId} invite email to ${email}: ${e}`
            );
          }
        }
      } catch (e) {
        this.logger.error('failed to invite user', e);
      }
      results.push(ret);
    }

    const memberCount = quota.memberCount + results.length;
    if (memberCount > quota.memberLimit) {
      this.event.emit('workspace.members.updated', {
        workspaceId,
        count: memberCount,
      });
    }

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
      if (Number.isSafeInteger(expireTime)) {
        return {
          link: this.url.link(`/invite/${id.inviteId}`),
          expireTime: new Date(Date.now() + expireTime),
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
          expireTime: new Date(Date.now() + expireTime),
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
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');

    const role = await this.models.workspaceUser.get(workspaceId, userId);

    if (role) {
      if (role.status === WorkspaceMemberStatus.UnderReview) {
        const result = await this.models.workspaceUser.setStatus(
          workspaceId,
          userId,
          WorkspaceMemberStatus.Accepted
        );

        this.event.emit('workspace.members.requestApproved', {
          inviteId: result.id,
        });
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
}
