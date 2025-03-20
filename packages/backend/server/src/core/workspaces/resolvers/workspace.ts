import {
  Args,
  Field,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { WorkspaceMemberStatus } from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import type { FileUpload } from '../../../base';
import {
  AFFiNELogger,
  AlreadyInSpace,
  Cache,
  CanNotRevokeYourself,
  DocNotFound,
  EventBus,
  InternalServerError,
  MemberNotFoundInSpace,
  MemberQuotaExceeded,
  OwnerCanNotLeaveWorkspace,
  QueryTooLong,
  registerObjectType,
  RequestMutex,
  SpaceAccessDenied,
  SpaceNotFound,
  Throttle,
  TooManyRequest,
  UserFriendlyError,
  UserNotFound,
} from '../../../base';
import { Models } from '../../../models';
import { CurrentUser, Public } from '../../auth';
import { type Editor } from '../../doc';
import {
  AccessController,
  WORKSPACE_ACTIONS,
  WorkspaceAction,
  WorkspaceRole,
} from '../../permission';
import { QuotaService, WorkspaceQuotaType } from '../../quota';
import { UserType } from '../../user';
import {
  InvitationType,
  InviteUserType,
  UpdateWorkspaceInput,
  WorkspaceType,
} from '../types';
import { WorkspaceService } from './service';

export type DotToUnderline<T extends string> =
  T extends `${infer Prefix}.${infer Suffix}`
    ? `${Prefix}_${DotToUnderline<Suffix>}`
    : T;

export function mapPermissionsToGraphqlPermissions<A extends string>(
  permission: Record<A, boolean>
): Record<DotToUnderline<A>, boolean> {
  return Object.fromEntries(
    Object.entries(permission).map(([key, value]) => [
      key.replaceAll('.', '_'),
      value,
    ])
  ) as Record<DotToUnderline<A>, boolean>;
}

@ObjectType()
export class EditorType implements Partial<Editor> {
  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  avatarUrl!: string | null;
}

@ObjectType()
class WorkspacePageMeta {
  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => EditorType, { nullable: true })
  createdBy!: EditorType | null;

  @Field(() => EditorType, { nullable: true })
  updatedBy!: EditorType | null;
}

const WorkspacePermissions = registerObjectType<
  Record<DotToUnderline<WorkspaceAction>, boolean>
>(
  Object.fromEntries(
    WORKSPACE_ACTIONS.map(action => [
      action.replaceAll('.', '_'),
      {
        type: () => Boolean,
        options: {
          name: action.replaceAll('.', '_'),
        },
      },
    ])
  ),
  { name: 'WorkspacePermissions' }
);

@ObjectType()
export class WorkspaceRolePermissions {
  @Field(() => WorkspaceRole)
  role!: WorkspaceRole;

  @Field(() => WorkspacePermissions)
  permissions!: Record<DotToUnderline<WorkspaceAction>, boolean>;
}

/**
 * Workspace resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@Resolver(() => WorkspaceType)
export class WorkspaceResolver {
  constructor(
    private readonly cache: Cache,
    private readonly ac: AccessController,
    private readonly quota: QuotaService,
    private readonly models: Models,
    private readonly event: EventBus,
    private readonly mutex: RequestMutex,
    private readonly workspaceService: WorkspaceService,
    private readonly logger: AFFiNELogger
  ) {
    logger.setContext(WorkspaceResolver.name);
  }

  @ResolveField(() => WorkspaceRole, {
    description: 'Role of current signed in user in workspace',
    complexity: 2,
  })
  async role(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    // may applied in workspaces query
    if ('role' in workspace) {
      return workspace.role;
    }

    const { role } = await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .permissions();

    return role ?? WorkspaceRole.External;
  }

  @ResolveField(() => WorkspacePermissions, {
    description: 'map of action permissions',
  })
  async permissions(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    const { permissions } = await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .permissions();

    return mapPermissionsToGraphqlPermissions(permissions);
  }

  @ResolveField(() => Int, {
    description: 'member count of workspace',
    complexity: 2,
  })
  memberCount(@Parent() workspace: WorkspaceType) {
    return this.models.workspaceUser.count(workspace.id);
  }

  @ResolveField(() => Boolean, {
    description: 'is current workspace initialized',
    complexity: 2,
  })
  async initialized(@Parent() workspace: WorkspaceType) {
    return this.models.doc.exists(workspace.id, workspace.id);
  }

  @ResolveField(() => UserType, {
    description: 'Owner of workspace',
    complexity: 2,
  })
  async owner(@Parent() workspace: WorkspaceType) {
    return this.models.workspaceUser.getOwner(workspace.id);
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

      return list.map(({ id, accepted, status, type, user }) => ({
        ...user,
        permission: type,
        inviteId: id,
        accepted,
        status,
      }));
    } else {
      const [list] = await this.models.workspaceUser.paginate(workspace.id, {
        offset: skip ?? 0,
        first: take ?? 8,
      });

      return list.map(({ id, accepted, status, type, user }) => ({
        ...user,
        permission: type,
        inviteId: id,
        accepted,
        status,
      }));
    }
  }

  @ResolveField(() => WorkspacePageMeta, {
    description: 'Cloud page metadata of workspace',
    complexity: 2,
  })
  async pageMeta(
    @Parent() workspace: WorkspaceType,
    @Args('pageId') pageId: string
  ) {
    const metadata = await this.models.doc.getAuthors(workspace.id, pageId);
    if (!metadata) {
      throw new DocNotFound({ spaceId: workspace.id, docId: pageId });
    }

    return {
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      createdBy: metadata.createdByUser || null,
      updatedBy: metadata.updatedByUser || null,
    };
  }

  @ResolveField(() => WorkspaceQuotaType, {
    name: 'quota',
    description: 'quota of workspace',
    complexity: 2,
  })
  async workspaceQuota(
    @Parent() workspace: WorkspaceType
  ): Promise<WorkspaceQuotaType> {
    const quota = await this.quota.getWorkspaceQuotaWithUsage(workspace.id);
    return {
      ...quota,
      humanReadable: this.quota.formatWorkspaceQuota(quota),
    };
  }

  @Query(() => Boolean, {
    description: 'Get is owner of workspace',
    complexity: 2,
    deprecationReason: 'use WorkspaceType[role] instead',
  })
  async isOwner(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    const role = await this.models.workspaceUser.getActive(
      workspaceId,
      user.id
    );

    return role?.type === WorkspaceRole.Owner;
  }

  @Query(() => Boolean, {
    description: 'Get is admin of workspace',
    complexity: 2,
    deprecationReason: 'use WorkspaceType[role] instead',
  })
  async isAdmin(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    const role = await this.models.workspaceUser.getActive(
      workspaceId,
      user.id
    );

    return role?.type === WorkspaceRole.Admin;
  }

  @Query(() => [WorkspaceType], {
    description: 'Get all accessible workspaces for current user',
    complexity: 2,
  })
  async workspaces(@CurrentUser() user: CurrentUser) {
    const roles = await this.models.workspaceUser.getUserActiveRoles(user.id);

    const map = new Map(
      roles.map(({ workspaceId, type }) => [workspaceId, type])
    );

    const workspaces = await this.models.workspace.findMany(
      roles.map(({ workspaceId }) => workspaceId)
    );

    return workspaces.map(workspace => ({
      ...workspace,
      permission: map.get(workspace.id),
      role: map.get(workspace.id),
    }));
  }

  @Query(() => WorkspaceType, {
    description: 'Get workspace by id',
  })
  async workspace(@CurrentUser() user: CurrentUser, @Args('id') id: string) {
    await this.ac.user(user.id).workspace(id).assert('Workspace.Read');

    const workspace = await this.models.workspace.get(id);

    if (!workspace) {
      throw new SpaceNotFound({ spaceId: id });
    }

    return workspace;
  }

  @Query(() => WorkspaceRolePermissions, {
    description: 'Get workspace role permissions',
    deprecationReason: 'use WorkspaceType[permissions] instead',
  })
  async workspaceRolePermissions(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string
  ): Promise<WorkspaceRolePermissions> {
    const { role, permissions } = await this.ac
      .user(user.id)
      .workspace(id)
      .permissions();

    if (!role) {
      throw new SpaceAccessDenied({ spaceId: id });
    }

    return {
      role,
      permissions: mapPermissionsToGraphqlPermissions(permissions),
    };
  }

  @Mutation(() => WorkspaceType, {
    description: 'Create a new workspace',
  })
  async createWorkspace(
    @CurrentUser() user: CurrentUser,
    // we no longer support init workspace with a preload file
    // use sync system to uploading them once created
    @Args({ name: 'init', type: () => GraphQLUpload, nullable: true })
    init: FileUpload | null
  ) {
    const workspace = await this.models.workspace.create(user.id);

    if (init) {
      // convert stream to buffer
      const chunks: Uint8Array[] = [];
      try {
        for await (const chunk of init.createReadStream()) {
          chunks.push(chunk);
        }
      } catch (e) {
        this.logger.error('Failed to get file content from upload stream', e);
        chunks.length = 0;
      }
      const buffer = chunks.length ? Buffer.concat(chunks) : null;

      if (buffer) {
        await this.models.doc.upsert({
          spaceId: workspace.id,
          docId: workspace.id,
          blob: buffer,
          timestamp: Date.now(),
          editorId: user.id,
        });
      }
    }

    return workspace;
  }

  @Mutation(() => WorkspaceType, {
    description: 'Update workspace',
  })
  async updateWorkspace(
    @CurrentUser() user: CurrentUser,
    @Args({ name: 'input', type: () => UpdateWorkspaceInput })
    { id, ...updates }: UpdateWorkspaceInput
  ) {
    await this.ac
      .user(user.id)
      .workspace(id)
      .assert('Workspace.Settings.Update');
    return this.models.workspace.update(id, updates);
  }

  @Mutation(() => Boolean)
  async deleteWorkspace(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string
  ) {
    await this.ac.user(user.id).workspace(id).assert('Workspace.Delete');

    await this.models.workspace.delete(id);

    return true;
  }

  @Mutation(() => String)
  async invite(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('email') email: string,
    @Args('sendInviteMail', { nullable: true }) sendInviteMail: boolean,
    @Args('permission', {
      type: () => WorkspaceRole,
      nullable: true,
      deprecationReason: 'never used',
    })
    _permission?: WorkspaceRole
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Users.Manage');

    try {
      // lock to prevent concurrent invite and grant
      const lockFlag = `invite:${workspaceId}`;
      await using lock = await this.mutex.acquire(lockFlag);
      if (!lock) {
        throw new TooManyRequest();
      }

      // member limit check
      await this.quota.checkSeat(workspaceId);

      let user = await this.models.user.getUserByEmail(email);
      if (user) {
        const role = await this.models.workspaceUser.get(workspaceId, user.id);
        // only invite if the user is not already in the workspace
        if (role) return role.id;
      } else {
        user = await this.models.user.create({
          email,
          registered: false,
        });
      }

      const role = await this.models.workspaceUser.set(
        workspaceId,
        user.id,
        WorkspaceRole.Collaborator
      );

      if (sendInviteMail) {
        try {
          await this.workspaceService.sendInviteEmail({
            workspaceId,
            inviteeEmail: email,
            inviterUserId: user.id,
            inviteId: role.id,
          });
        } catch (e) {
          await this.models.workspaceUser.delete(workspaceId, user.id);

          this.logger.warn(
            `failed to send ${workspaceId} invite email to ${email}, but successfully revoked permission: ${e}`
          );

          throw new InternalServerError(
            'Failed to send invite email. Please try again.'
          );
        }
      }
      return role.id;
    } catch (e) {
      // pass through user friendly error
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      this.logger.error('failed to invite user', e);
      throw new TooManyRequest();
    }
  }

  @Throttle('strict')
  @Public()
  @Query(() => InvitationType, {
    description: 'send workspace invitation',
  })
  async getInviteInfo(
    @CurrentUser() user: UserType | undefined,
    @Args('inviteId') inviteId: string
  ) {
    const { workspaceId, inviteeUserId } =
      await this.workspaceService.getInviteInfo(inviteId);
    const workspace = await this.workspaceService.getWorkspaceInfo(workspaceId);
    const owner = await this.models.workspaceUser.getOwner(workspaceId);

    const inviteeId = inviteeUserId || user?.id;
    if (!inviteeId) throw new UserNotFound();
    const invitee = await this.models.user.getWorkspaceUser(inviteeId);

    return { workspace, user: owner, invitee };
  }

  @Mutation(() => Boolean)
  async revoke(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    if (userId === user.id) {
      throw new CanNotRevokeYourself();
    }

    const role = await this.models.workspaceUser.get(workspaceId, userId);

    if (!role) {
      throw new MemberNotFoundInSpace({ spaceId: workspaceId });
    }

    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert(
        role.type === WorkspaceRole.Admin
          ? 'Workspace.Administrators.Manage'
          : 'Workspace.Users.Manage'
      );

    await this.models.workspaceUser.delete(workspaceId, userId);

    const count = await this.models.workspaceUser.count(workspaceId);

    this.event.emit('workspace.members.updated', {
      workspaceId,
      count,
    });

    if (role.status === WorkspaceMemberStatus.UnderReview) {
      this.event.emit('workspace.members.requestDeclined', {
        userId,
        workspaceId,
      });
    } else if (role.status === WorkspaceMemberStatus.Accepted) {
      this.event.emit('workspace.members.removed', {
        userId,
        workspaceId,
      });
    }

    return true;
  }

  @Mutation(() => Boolean)
  @Public()
  async acceptInviteById(
    @CurrentUser() user: CurrentUser | undefined,
    @Args('workspaceId') workspaceId: string,
    @Args('inviteId') inviteId: string,
    @Args('sendAcceptMail', { nullable: true }) sendAcceptMail: boolean
  ) {
    const lockFlag = `invite:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest();
    }

    if (user) {
      const role = await this.models.workspaceUser.getActive(
        workspaceId,
        user.id
      );

      if (role) {
        throw new AlreadyInSpace({ spaceId: workspaceId });
      }

      // invite link
      const invite = await this.cache.get<{ inviteId: string }>(
        `workspace:inviteLink:${workspaceId}`
      );
      if (invite?.inviteId === inviteId) {
        const seatAvailable = await this.quota.tryCheckSeat(workspaceId);
        if (seatAvailable) {
          const invite = await this.models.workspaceUser.set(
            workspaceId,
            user.id,
            WorkspaceRole.Collaborator,
            WorkspaceMemberStatus.UnderReview
          );
          this.event.emit('workspace.members.reviewRequested', {
            inviteId: invite.id,
          });
          return true;
        } else {
          const isTeam =
            await this.workspaceService.isTeamWorkspace(workspaceId);
          // only team workspace allow over limit
          if (isTeam) {
            await this.models.workspaceUser.set(
              workspaceId,
              user.id,
              WorkspaceRole.Collaborator,
              WorkspaceMemberStatus.NeedMoreSeatAndReview
            );
            const memberCount =
              await this.models.workspaceUser.count(workspaceId);
            this.event.emit('workspace.members.updated', {
              workspaceId,
              count: memberCount,
            });
            return true;
          } else {
            throw new MemberQuotaExceeded();
          }
        }
      }
    }

    if (sendAcceptMail) {
      const success = await this.workspaceService.sendAcceptedEmail(inviteId);
      if (!success) throw new UserNotFound();
    }

    await this.models.workspaceUser.accept(inviteId);
    return true;
  }

  @Mutation(() => Boolean)
  async leaveWorkspace(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('sendLeaveMail', { nullable: true }) sendLeaveMail?: boolean,
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

    if (sendLeaveMail) {
      await this.workspaceService.sendLeaveEmail(workspaceId, user.id);
    }

    return true;
  }
}
