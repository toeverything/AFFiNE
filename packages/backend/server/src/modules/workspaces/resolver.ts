import type { Storage } from '@affine/storage';
import {
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  Args,
  Field,
  Float,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  OmitType,
  Parent,
  PartialType,
  PickType,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type {
  User,
  Workspace,
  WorkspacePage as PrismaWorkspacePage,
} from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { applyUpdate, Doc } from 'yjs';

import { PrismaService } from '../../prisma';
import { StorageProvide } from '../../storage';
import { CloudThrottlerGuard, Throttle } from '../../throttler';
import type { FileUpload } from '../../types';
import { DocID } from '../../utils/doc';
import { Auth, CurrentUser, Public } from '../auth';
import { MailService } from '../auth/mailer';
import { AuthService } from '../auth/service';
import { UsersService } from '../users';
import { UserType } from '../users/resolver';
import { PermissionService, PublicPageMode } from './permission';
import { Permission } from './types';
import { defaultWorkspaceAvatar } from './utils';

registerEnumType(Permission, {
  name: 'Permission',
  description: 'User permission in workspace',
});

@ObjectType()
export class InviteUserType extends OmitType(
  PartialType(UserType),
  ['id'],
  ObjectType
) {
  @Field(() => ID)
  id!: string;

  @Field(() => Permission, { description: 'User permission in workspace' })
  permission!: Permission;

  @Field({ description: 'Invite id' })
  inviteId!: string;

  @Field({ description: 'User accepted' })
  accepted!: boolean;
}

@ObjectType()
export class WorkspaceType implements Partial<Workspace> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'is Public workspace' })
  public!: boolean;

  @Field({ description: 'Workspace created date' })
  createdAt!: Date;

  @Field(() => [InviteUserType], {
    description: 'Members of workspace',
  })
  members!: InviteUserType[];
}

@ObjectType()
export class InvitationWorkspaceType {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Workspace name' })
  name!: string;

  @Field(() => String, {
    // nullable: true,
    description: 'Base64 encoded avatar',
  })
  avatar!: string;
}

@ObjectType()
export class WorkspaceBlobSizes {
  @Field(() => Float)
  size!: number;
}

@ObjectType()
export class InvitationType {
  @Field({ description: 'Workspace information' })
  workspace!: InvitationWorkspaceType;
  @Field({ description: 'User information' })
  user!: UserType;
  @Field({ description: 'Invitee information' })
  invitee!: UserType;
}

@InputType()
export class UpdateWorkspaceInput extends PickType(
  PartialType(WorkspaceType),
  ['public'],
  InputType
) {
  @Field(() => ID)
  id!: string;
}

/**
 * Workspace resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@UseGuards(CloudThrottlerGuard)
@Auth()
@Resolver(() => WorkspaceType)
export class WorkspaceResolver {
  private readonly logger = new Logger('WorkspaceResolver');

  constructor(
    private readonly auth: AuthService,
    private readonly mailer: MailService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly users: UsersService,
    @Inject(StorageProvide) private readonly storage: Storage
  ) {}

  @ResolveField(() => Permission, {
    description: 'Permission of current signed in user in workspace',
    complexity: 2,
  })
  async permission(
    @CurrentUser() user: UserType,
    @Parent() workspace: WorkspaceType
  ) {
    // may applied in workspaces query
    if ('permission' in workspace) {
      return workspace.permission;
    }

    const permission = await this.permissions.get(workspace.id, user.id);

    if (!permission) {
      throw new ForbiddenException();
    }

    return permission;
  }

  @ResolveField(() => Int, {
    description: 'member count of workspace',
    complexity: 2,
  })
  memberCount(@Parent() workspace: WorkspaceType) {
    return this.prisma.workspaceUserPermission.count({
      where: {
        workspaceId: workspace.id,
      },
    });
  }

  @ResolveField(() => UserType, {
    description: 'Owner of workspace',
    complexity: 2,
  })
  async owner(@Parent() workspace: WorkspaceType) {
    const data = await this.permissions.getWorkspaceOwner(workspace.id);

    return data.user;
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

  @Query(() => Boolean, {
    description: 'Get is owner of workspace',
    complexity: 2,
  })
  async isOwner(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    const data = await this.permissions.tryGetWorkspaceOwner(workspaceId);

    return data?.user?.id === user.id;
  }

  @Query(() => [WorkspaceType], {
    description: 'Get all accessible workspaces for current user',
    complexity: 2,
  })
  async workspaces(@CurrentUser() user: User) {
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

  @Throttle({
    default: {
      limit: 10,
      ttl: 30,
    },
  })
  @Public()
  @Query(() => WorkspaceType, {
    description: 'Get public workspace by id',
  })
  async publicWorkspace(@Args('id') id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    if (workspace?.public) {
      return workspace;
    }

    throw new NotFoundException("Workspace doesn't exist");
  }

  @Query(() => WorkspaceType, {
    description: 'Get workspace by id',
  })
  async workspace(@CurrentUser() user: UserType, @Args('id') id: string) {
    await this.permissions.checkWorkspace(id, user.id);
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });

    if (!workspace) {
      throw new NotFoundException("Workspace doesn't exist");
    }

    return workspace;
  }

  @Mutation(() => WorkspaceType, {
    description: 'Create a new workspace',
  })
  async createWorkspace(
    @CurrentUser() user: UserType,
    @Args({ name: 'init', type: () => GraphQLUpload })
    update: FileUpload
  ) {
    // convert stream to buffer
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = update.createReadStream();
      const chunks: Uint8Array[] = [];
      stream.on('data', chunk => {
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    const workspace = await this.prisma.workspace.create({
      data: {
        public: false,
        permissions: {
          create: {
            type: Permission.Owner,
            user: {
              connect: {
                id: user.id,
              },
            },
            accepted: true,
          },
        },
      },
    });

    if (buffer.length) {
      await this.prisma.snapshot.create({
        data: {
          id: workspace.id,
          workspaceId: workspace.id,
          blob: buffer,
        },
      });
    }

    return workspace;
  }

  @Mutation(() => WorkspaceType, {
    description: 'Update workspace',
  })
  async updateWorkspace(
    @CurrentUser() user: UserType,
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
  async deleteWorkspace(@CurrentUser() user: UserType, @Args('id') id: string) {
    await this.permissions.checkWorkspace(id, user.id, Permission.Owner);

    await this.prisma.workspace.delete({
      where: {
        id,
      },
    });

    await this.prisma.$transaction([
      this.prisma.update.deleteMany({
        where: {
          workspaceId: id,
        },
      }),
      this.prisma.snapshot.deleteMany({
        where: {
          workspaceId: id,
        },
      }),
    ]);

    return true;
  }

  @Mutation(() => String)
  async invite(
    @CurrentUser() user: UserType,
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
      throw new ForbiddenException('Cannot change owner');
    }

    const target = await this.users.findUserByEmail(email);

    if (target) {
      const originRecord = await this.prisma.workspaceUserPermission.findFirst({
        where: {
          workspaceId,
          userId: target.id,
        },
      });

      if (originRecord) {
        return originRecord.id;
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

          return new InternalServerErrorException(e);
        }
      }
      return inviteId;
    } else {
      const user = await this.auth.createAnonymousUser(email);
      const inviteId = await this.permissions.grant(
        workspaceId,
        user.id,
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
            user.id
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

          return new InternalServerErrorException(e);
        }
      }
      return inviteId;
    }
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 30,
    },
  })
  @Public()
  @Query(() => InvitationType, {
    description: 'Update workspace',
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

    const snapshot = await this.prisma.snapshot.findFirstOrThrow({
      where: {
        id: workspaceId,
        workspaceId,
      },
    });

    const doc = new Doc();

    applyUpdate(doc, new Uint8Array(snapshot.blob));
    const metaJSON = doc.getMap('meta').toJSON();

    const owner = await this.permissions.getWorkspaceOwner(workspaceId);
    const invitee = await this.permissions.getWorkspaceInvitation(
      inviteId,
      workspaceId
    );

    let avatar = '';

    if (metaJSON.avatar) {
      const avatarBlob = await this.storage.getBlob(
        workspaceId,
        metaJSON.avatar
      );
      avatar = avatarBlob?.data.toString('base64') || '';
    }

    return {
      workspace: {
        name: metaJSON.name || '',
        avatar: avatar || defaultWorkspaceAvatar,
        id: workspaceId,
      },
      user: owner.user,
      invitee: invitee.user,
    };
  }

  @Mutation(() => Boolean)
  async revoke(
    @CurrentUser() user: UserType,
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
      throw new ForbiddenException(
        `can not find inviter/invitee by inviteId: ${inviteId}`
      );
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
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('workspaceName') workspaceName: string,
    @Args('sendLeaveMail', { nullable: true }) sendLeaveMail: boolean
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    const owner = await this.permissions.getWorkspaceOwner(workspaceId);

    if (!owner.user) {
      throw new ForbiddenException(
        `can not find owner by workspaceId: ${workspaceId}`
      );
    }

    if (sendLeaveMail) {
      await this.mailer.sendLeaveWorkspaceEmail(owner.user.email, {
        workspaceName,
        inviteeName: user.name,
      });
    }

    return this.permissions.revokeWorkspace(workspaceId, user.id);
  }

  @Query(() => [String], {
    description: 'List blobs of workspace',
  })
  async listBlobs(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    return this.storage.listBlobs(workspaceId);
  }

  @Query(() => WorkspaceBlobSizes)
  async collectBlobSizes(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    return this.storage.blobsSize([workspaceId]).then(size => ({ size }));
  }

  @Query(() => WorkspaceBlobSizes)
  async collectAllBlobSizes(@CurrentUser() user: UserType) {
    const workspaces = await this.prisma.workspaceUserPermission
      .findMany({
        where: {
          userId: user.id,
          accepted: true,
          type: Permission.Owner,
        },
        select: {
          workspace: {
            select: {
              id: true,
            },
          },
        },
      })
      .then(data => data.map(({ workspace }) => workspace.id));

    const size = await this.storage.blobsSize(workspaces);
    return { size };
  }

  @Query(() => WorkspaceBlobSizes)
  async checkBlobSize(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('size', { type: () => Float }) size: number
  ) {
    const canWrite = await this.permissions.tryCheckWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );
    if (canWrite) {
      const { user } = await this.permissions.getWorkspaceOwner(workspaceId);
      if (user) {
        const quota = await this.users.getStorageQuotaById(user.id);
        const { size: currentSize } = await this.collectAllBlobSizes(user);

        return { size: quota - (size + currentSize) };
      }
    }
    return false;
  }

  @Mutation(() => String)
  async setBlob(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );

    // quota was apply to owner's account
    const { user: owner } =
      await this.permissions.getWorkspaceOwner(workspaceId);
    if (!owner) return new NotFoundException('Workspace owner not found');
    const quota = await this.users.getStorageQuotaById(owner.id);
    const { size } = await this.collectAllBlobSizes(owner);

    const checkExceeded = (recvSize: number) => {
      if (size + recvSize > quota) {
        this.logger.log(
          `storage size limit exceeded: ${size + recvSize} > ${quota}`
        );
        return true;
      } else {
        return false;
      }
    };

    if (checkExceeded(0)) {
      throw new ForbiddenException('storage size limit exceeded');
    }
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = blob.createReadStream();
      const chunks: Uint8Array[] = [];
      stream.on('data', chunk => {
        chunks.push(chunk);

        // check size after receive each chunk to avoid unnecessary memory usage
        const bufferSize = chunks.reduce((acc, cur) => acc + cur.length, 0);
        if (checkExceeded(bufferSize)) {
          reject(new ForbiddenException('storage size limit exceeded'));
        }
      });
      stream.on('error', reject);
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);

        if (checkExceeded(buffer.length)) {
          reject(new ForbiddenException('storage size limit exceeded'));
        } else {
          resolve(buffer);
        }
      });
    });

    return this.storage.uploadBlob(workspaceId, buffer);
  }

  @Mutation(() => Boolean)
  async deleteBlob(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('hash') hash: string
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    return this.storage.deleteBlob(workspaceId, hash);
  }
}

registerEnumType(PublicPageMode, {
  name: 'PublicPageMode',
  description: 'The mode which the public page default in',
});

@ObjectType()
class WorkspacePage implements Partial<PrismaWorkspacePage> {
  @Field(() => String, { name: 'id' })
  pageId!: string;

  @Field()
  workspaceId!: string;

  @Field(() => PublicPageMode)
  mode!: PublicPageMode;

  @Field()
  public!: boolean;
}

@UseGuards(CloudThrottlerGuard)
@Auth()
@Resolver(() => WorkspaceType)
export class PagePermissionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: PermissionService
  ) {}

  /**
   * @deprecated
   */
  @ResolveField(() => [String], {
    description: 'Shared pages of workspace',
    complexity: 2,
    deprecationReason: 'use WorkspaceType.publicPages',
  })
  async sharedPages(@Parent() workspace: WorkspaceType) {
    const data = await this.prisma.workspacePage.findMany({
      where: {
        workspaceId: workspace.id,
        public: true,
      },
    });

    return data.map(row => row.pageId);
  }

  @ResolveField(() => [WorkspacePage], {
    description: 'Public pages of a workspace',
    complexity: 2,
  })
  async publicPages(@Parent() workspace: WorkspaceType) {
    return this.prisma.workspacePage.findMany({
      where: {
        workspaceId: workspace.id,
        public: true,
      },
    });
  }

  /**
   * @deprecated
   */
  @Mutation(() => Boolean, {
    name: 'sharePage',
    deprecationReason: 'renamed to publicPage',
  })
  async deprecatedSharePage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    await this.publishPage(user, workspaceId, pageId, PublicPageMode.Page);
    return true;
  }

  @Mutation(() => WorkspacePage)
  async publishPage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string,
    @Args({
      name: 'mode',
      type: () => PublicPageMode,
      nullable: true,
      defaultValue: PublicPageMode.Page,
    })
    mode: PublicPageMode
  ) {
    const docId = new DocID(pageId, workspaceId);

    if (docId.isWorkspace) {
      throw new ForbiddenException('Expect page not to be workspace');
    }

    await this.permission.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );

    return this.permission.publishPage(docId.workspace, docId.guid, mode);
  }

  /**
   * @deprecated
   */
  @Mutation(() => Boolean, {
    name: 'revokePage',
    deprecationReason: 'use revokePublicPage',
  })
  async deprecatedRevokePage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    await this.revokePublicPage(user, workspaceId, pageId);
    return true;
  }

  @Mutation(() => WorkspacePage)
  async revokePublicPage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    const docId = new DocID(pageId, workspaceId);

    if (docId.isWorkspace) {
      throw new ForbiddenException('Expect page not to be workspace');
    }

    await this.permission.checkWorkspace(
      docId.workspace,
      user.id,
      Permission.Admin
    );

    return this.permission.revokePublicPage(docId.workspace, docId.guid);
  }
}
