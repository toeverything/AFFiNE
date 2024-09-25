import { Logger } from '@nestjs/common';
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
import { PrismaClient } from '@prisma/client';
import { getStreamAsBuffer } from 'get-stream';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import type { FileUpload } from '../../../fundamentals';
import {
  CantChangeSpaceOwner,
  DocNotFound,
  EventEmitter,
  InternalServerError,
  MailService,
  MemberQuotaExceeded,
  RequestMutex,
  SpaceAccessDenied,
  SpaceNotFound,
  Throttle,
  TooManyRequest,
  UserNotFound,
} from '../../../fundamentals';
import { CurrentUser, Public } from '../../auth';
import { type Editor, PgWorkspaceDocStorageAdapter } from '../../doc';
import { DocContentService } from '../../doc-renderer';
import { Permission, PermissionService } from '../../permission';
import { QuotaManagementService, QuotaQueryType } from '../../quota';
import { WorkspaceBlobStorage } from '../../storage';
import { UserService, UserType } from '../../user';
import {
  InvitationType,
  InviteUserType,
  UpdateWorkspaceInput,
  WorkspaceType,
} from '../types';
import { defaultWorkspaceAvatar } from '../utils';

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

/**
 * Workspace resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@Resolver(() => WorkspaceType)
export class WorkspaceResolver {
  private readonly logger = new Logger(WorkspaceResolver.name);

  constructor(
    private readonly mailer: MailService,
    private readonly prisma: PrismaClient,
    private readonly permissions: PermissionService,
    private readonly quota: QuotaManagementService,
    private readonly users: UserService,
    private readonly event: EventEmitter,
    private readonly blobStorage: WorkspaceBlobStorage,
    private readonly mutex: RequestMutex,
    private readonly doc: DocContentService,
    private readonly workspaceStorage: PgWorkspaceDocStorageAdapter
  ) {}

  @ResolveField(() => Permission, {
    description: 'Permission of current signed in user in workspace',
    complexity: 2,
  })
  async permission(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    // may applied in workspaces query
    if ('permission' in workspace) {
      return workspace.permission;
    }

    const permission = await this.permissions.get(workspace.id, user.id);

    if (!permission) {
      throw new SpaceAccessDenied({ spaceId: workspace.id });
    }

    return permission;
  }

  @ResolveField(() => Int, {
    description: 'member count of workspace',
    complexity: 2,
  })
  memberCount(@Parent() workspace: WorkspaceType) {
    return this.permissions.getWorkspaceMemberCount(workspace.id);
  }

  @ResolveField(() => Boolean, {
    description: 'is current workspace initialized',
    complexity: 2,
  })
  async initialized(@Parent() workspace: WorkspaceType) {
    return this.prisma.snapshot
      .count({
        where: {
          id: workspace.id,
          workspaceId: workspace.id,
        },
      })
      .then(count => count > 0);
  }

  @ResolveField(() => UserType, {
    description: 'Owner of workspace',
    complexity: 2,
  })
  async owner(@Parent() workspace: WorkspaceType) {
    return this.permissions.getWorkspaceOwner(workspace.id);
  }

  @ResolveField(() => [InviteUserType], {
    description: 'Members of workspace',
    complexity: 2,
  })
  async members(
    @Parent() workspace: WorkspaceType,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number
  ) {
    const data = await this.prisma.workspaceUserPermission.findMany({
      where: {
        workspaceId: workspace.id,
      },
      skip,
      take: take || 8,
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          type: 'desc',
        },
      ],
      include: {
        user: true,
      },
    });

    return data
      .filter(({ user }) => !!user)
      .map(({ id, accepted, type, user }) => ({
        ...user,
        permission: type,
        inviteId: id,
        accepted,
      }));
  }

  @ResolveField(() => WorkspacePageMeta, {
    description: 'Cloud page metadata of workspace',
    complexity: 2,
  })
  async pageMeta(
    @Parent() workspace: WorkspaceType,
    @Args('pageId') pageId: string
  ) {
    const metadata = await this.prisma.snapshot.findFirst({
      where: { workspaceId: workspace.id, id: pageId },
      select: {
        createdAt: true,
        updatedAt: true,
        createdByUser: { select: { name: true, avatarUrl: true } },
        updatedByUser: { select: { name: true, avatarUrl: true } },
      },
    });
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

  @ResolveField(() => QuotaQueryType, {
    name: 'quota',
    description: 'quota of workspace',
    complexity: 2,
  })
  workspaceQuota(@Parent() workspace: WorkspaceType) {
    return this.quota.getWorkspaceUsage(workspace.id);
  }

  @Query(() => Boolean, {
    description: 'Get is owner of workspace',
    complexity: 2,
  })
  async isOwner(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    const data = await this.permissions.tryGetWorkspaceOwner(workspaceId);

    return data?.user?.id === user.id;
  }

  @Query(() => [WorkspaceType], {
    description: 'Get all accessible workspaces for current user',
    complexity: 2,
  })
  async workspaces(@CurrentUser() user: CurrentUser) {
    const data = await this.prisma.workspaceUserPermission.findMany({
      where: {
        userId: user.id,
        accepted: true,
      },
      include: {
        workspace: true,
      },
    });

    return data.map(({ workspace, type }) => {
      return {
        ...workspace,
        permission: type,
      };
    });
  }

  @Query(() => WorkspaceType, {
    description: 'Get workspace by id',
  })
  async workspace(@CurrentUser() user: CurrentUser, @Args('id') id: string) {
    await this.permissions.checkWorkspace(id, user.id);
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });

    if (!workspace) {
      throw new SpaceNotFound({ spaceId: id });
    }

    return workspace;
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
    const workspace = await this.prisma.workspace.create({
      data: {
        public: false,
        permissions: {
          create: {
            type: Permission.Owner,
            userId: user.id,
            accepted: true,
          },
        },
      },
    });

    if (init) {
      // convert stream to buffer
      const buffer = await new Promise<Buffer>(resolve => {
        const stream = init.createReadStream();
        const chunks: Uint8Array[] = [];
        stream.on('data', chunk => {
          chunks.push(chunk);
        });
        stream.on('error', () => {
          resolve(Buffer.from([]));
        });
        stream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      if (buffer.length) {
        await this.prisma.snapshot.create({
          data: {
            id: workspace.id,
            workspaceId: workspace.id,
            blob: buffer,
            updatedAt: new Date(),
          },
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
    await this.permissions.checkWorkspace(id, user.id, Permission.Admin);

    return this.prisma.workspace.update({
      where: {
        id,
      },
      data: updates,
    });
  }

  @Mutation(() => Boolean)
  async deleteWorkspace(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string
  ) {
    await this.permissions.checkWorkspace(id, user.id, Permission.Owner);

    await this.prisma.workspace.delete({
      where: {
        id,
      },
    });
    await this.workspaceStorage.deleteSpace(id);

    this.event.emit('workspace.deleted', id);

    return true;
  }

  @Mutation(() => String)
  async invite(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('email') email: string,
    @Args('permission', { type: () => Permission }) permission: Permission,
    @Args('sendInviteMail', { nullable: true }) sendInviteMail: boolean
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );

    if (permission === Permission.Owner) {
      throw new CantChangeSpaceOwner();
    }

    try {
      // lock to prevent concurrent invite
      const lockFlag = `invite:${workspaceId}`;
      await using lock = await this.mutex.lock(lockFlag);
      if (!lock) {
        return new TooManyRequest();
      }

      // member limit check
      const quota = await this.quota.getWorkspaceUsage(workspaceId);
      if (quota.memberCount >= quota.memberLimit) {
        return new MemberQuotaExceeded();
      }

      let target = await this.users.findUserByEmail(email);
      if (target) {
        const originRecord =
          await this.prisma.workspaceUserPermission.findFirst({
            where: {
              workspaceId,
              userId: target.id,
            },
          });
        // only invite if the user is not already in the workspace
        if (originRecord) return originRecord.id;
      } else {
        target = await this.users.createUser({
          email,
          registered: false,
        });
      }

      const inviteId = await this.permissions.grant(
        workspaceId,
        target.id,
        permission
      );
      if (sendInviteMail) {
        const inviteInfo = await this.getInviteInfo(inviteId);

        try {
          await this.mailer.sendInviteEmail(email, inviteId, {
            workspace: {
              id: inviteInfo.workspace.id,
              name: inviteInfo.workspace.name,
              avatar: inviteInfo.workspace.avatar,
            },
            user: {
              avatar: inviteInfo.user?.avatarUrl || '',
              name: inviteInfo.user?.name || '',
            },
          });
        } catch (e) {
          const ret = await this.permissions.revokeWorkspace(
            workspaceId,
            target.id
          );

          if (!ret) {
            this.logger.fatal(
              `failed to send ${workspaceId} invite email to ${email} and failed to revoke permission: ${inviteId}, ${e}`
            );
          } else {
            this.logger.warn(
              `failed to send ${workspaceId} invite email to ${email}, but successfully revoked permission: ${e}`
            );
          }
          throw new InternalServerError(
            'Failed to send invite email. Please try again.'
          );
        }
      }
      return inviteId;
    } catch (e) {
      this.logger.error('failed to invite user', e);
      return new TooManyRequest();
    }
  }

  @Throttle('strict')
  @Public()
  @Query(() => InvitationType, {
    description: 'send workspace invitation',
  })
  async getInviteInfo(@Args('inviteId') inviteId: string) {
    const workspaceId = await this.prisma.workspaceUserPermission
      .findUniqueOrThrow({
        where: {
          id: inviteId,
        },
        select: {
          workspaceId: true,
        },
      })
      .then(({ workspaceId }) => workspaceId);

    const workspaceContent = await this.doc.getWorkspaceContent(workspaceId);

    const owner = await this.permissions.getWorkspaceOwner(workspaceId);
    const invitee = await this.permissions.getWorkspaceInvitation(
      inviteId,
      workspaceId
    );

    let avatar = '';
    if (workspaceContent?.avatarKey) {
      const avatarBlob = await this.blobStorage.get(
        workspaceId,
        workspaceContent.avatarKey
      );

      if (avatarBlob.body) {
        avatar = (await getStreamAsBuffer(avatarBlob.body)).toString('base64');
      }
    }

    return {
      workspace: {
        name: workspaceContent?.name ?? '',
        avatar: avatar || defaultWorkspaceAvatar,
        id: workspaceId,
      },
      user: owner,
      invitee: invitee.user,
    };
  }

  @Mutation(() => Boolean)
  async revoke(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );

    return this.permissions.revokeWorkspace(workspaceId, userId);
  }

  @Mutation(() => Boolean)
  @Public()
  async acceptInviteById(
    @Args('workspaceId') workspaceId: string,
    @Args('inviteId') inviteId: string,
    @Args('sendAcceptMail', { nullable: true }) sendAcceptMail: boolean
  ) {
    const {
      invitee,
      user: inviter,
      workspace,
    } = await this.getInviteInfo(inviteId);

    if (!inviter || !invitee) {
      throw new UserNotFound();
    }

    if (sendAcceptMail) {
      await this.mailer.sendAcceptedEmail(inviter.email, {
        inviteeName: invitee.name,
        workspaceName: workspace.name,
      });
    }

    return this.permissions.acceptWorkspaceInvitation(inviteId, workspaceId);
  }

  @Mutation(() => Boolean)
  async leaveWorkspace(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('workspaceName') workspaceName: string,
    @Args('sendLeaveMail', { nullable: true }) sendLeaveMail: boolean
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    const owner = await this.permissions.getWorkspaceOwner(workspaceId);

    if (sendLeaveMail) {
      await this.mailer.sendLeaveWorkspaceEmail(owner.email, {
        workspaceName,
        inviteeName: user.name,
      });
    }

    return this.permissions.revokeWorkspace(workspaceId, user.id);
  }
}
