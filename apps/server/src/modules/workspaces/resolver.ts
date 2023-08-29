import type { Storage } from '@affine/storage';
import { ForbiddenException, Inject, NotFoundException } from '@nestjs/common';
import {
  Args,
  Field,
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
import type { User, Workspace } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { applyUpdate, Doc } from 'yjs';

import { PrismaService } from '../../prisma';
import { StorageProvide } from '../../storage';
import type { FileUpload } from '../../types';
import { Auth, CurrentUser, Public } from '../auth';
import { MailService } from '../auth/mailer';
import { AuthService } from '../auth/service';
import { UserType } from '../users/resolver';
import { PermissionService } from './permission';
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
export class InvitationType {
  @Field({ description: 'Workspace information' })
  workspace!: InvitationWorkspaceType;
  @Field({ description: 'User information' })
  user!: UserType;
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

@Auth()
@Resolver(() => WorkspaceType)
export class WorkspaceResolver {
  constructor(
    private readonly auth: AuthService,
    private readonly mailer: MailService,
    private readonly prisma: PrismaService,
    private readonly permissionProvider: PermissionService,
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

    const permission = await this.permissionProvider.get(workspace.id, user.id);

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
    return this.prisma.userWorkspacePermission.count({
      where: {
        workspaceId: workspace.id,
        accepted: true,
      },
    });
  }

  @ResolveField(() => [String], {
    description: 'Shared pages of workspace',
    complexity: 2,
  })
  async sharedPages(@Parent() workspace: WorkspaceType) {
    const data = await this.prisma.userWorkspacePermission.findMany({
      where: {
        workspaceId: workspace.id,
      },
    });

    return data.map(item => item.subPageId).filter(Boolean);
  }

  @ResolveField(() => UserType, {
    description: 'Owner of workspace',
    complexity: 2,
  })
  async owner(@Parent() workspace: WorkspaceType) {
    const data = await this.prisma.userWorkspacePermission.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        type: Permission.Owner,
      },
      include: {
        user: true,
      },
    });

    return data.user;
  }

  @ResolveField(() => [InviteUserType], {
    description: 'Members of workspace',
    complexity: 2,
  })
  async members(@Parent() workspace: WorkspaceType) {
    const data = await this.prisma.userWorkspacePermission.findMany({
      where: {
        workspaceId: workspace.id,
      },
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
    const data = await this.prisma.userWorkspacePermission.findFirst({
      where: {
        workspaceId,
        type: Permission.Owner,
      },
      include: {
        user: true,
      },
    });

    return data?.user?.id === user.id;
  }

  @Query(() => [WorkspaceType], {
    description: 'Get all accessible workspaces for current user',
    complexity: 2,
  })
  async workspaces(@CurrentUser() user: User) {
    const data = await this.prisma.userWorkspacePermission.findMany({
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
    description: 'Get public workspace by id',
  })
  @Public()
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
    await this.permissionProvider.check(id, user.id);
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
        users: {
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

    await this.prisma.snapshot.create({
      data: {
        id: workspace.id,
        workspaceId: workspace.id,
        blob: buffer,
      },
    });

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
    await this.permissionProvider.check(id, user.id, Permission.Admin);

    return this.prisma.workspace.update({
      where: {
        id,
      },
      data: updates,
    });
  }

  @Mutation(() => Boolean)
  async deleteWorkspace(@CurrentUser() user: UserType, @Args('id') id: string) {
    await this.permissionProvider.check(id, user.id, Permission.Owner);

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
    // TODO: add rate limit
    @Args('sendInviteMail', { nullable: true }) sendInviteMail: boolean
  ) {
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    if (permission === Permission.Owner) {
      throw new ForbiddenException('Cannot change owner');
    }

    const target = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (target) {
      const originRecord = await this.prisma.userWorkspacePermission.findFirst({
        where: {
          workspaceId,
          userId: target.id,
        },
      });

      if (originRecord) {
        return originRecord.id;
      }

      const inviteId = await this.permissionProvider.grant(
        workspaceId,
        target.id,
        permission
      );
      if (sendInviteMail) {
        const inviteInfo = await this.getInviteInfo(inviteId);

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
      }
      return inviteId;
    } else {
      const user = await this.auth.createAnonymousUser(email);
      const inviteId = await this.permissionProvider.grant(
        workspaceId,
        user.id,
        permission
      );
      if (sendInviteMail) {
        const inviteInfo = await this.getInviteInfo(inviteId);

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
      }
      return inviteId;
    }
  }

  @Public()
  @Query(() => InvitationType, {
    description: 'Update workspace',
  })
  async getInviteInfo(@Args('inviteId') inviteId: string) {
    const permission =
      await this.prisma.userWorkspacePermission.findUniqueOrThrow({
        where: {
          id: inviteId,
        },
      });

    const snapshot = await this.prisma.snapshot.findFirstOrThrow({
      where: {
        id: permission.workspaceId,
        workspaceId: permission.workspaceId,
      },
    });

    const doc = new Doc();

    applyUpdate(doc, new Uint8Array(snapshot.blob));
    const metaJSON = doc.getMap('meta').toJSON();

    const owner = await this.prisma.userWorkspacePermission.findFirstOrThrow({
      where: {
        workspaceId: permission.workspaceId,
        type: Permission.Owner,
      },
      include: {
        user: true,
      },
    });

    let avatar = '';

    if (metaJSON.avatar) {
      const avatarBlob = await this.storage.getBlob(
        permission.workspaceId,
        metaJSON.avatar
      );
      avatar = avatarBlob?.data.toString('base64') || '';
    }

    return {
      workspace: {
        name: metaJSON.name || '',
        avatar: avatar || defaultWorkspaceAvatar,
        id: permission.workspaceId,
      },
      user: owner.user,
    };
  }

  @Mutation(() => Boolean)
  async revoke(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    return this.permissionProvider.revoke(workspaceId, userId);
  }

  @Mutation(() => Boolean)
  @Public()
  async acceptInviteById(
    @Args('workspaceId') workspaceId: string,
    @Args('inviteId') inviteId: string
  ) {
    return this.permissionProvider.acceptById(workspaceId, inviteId);
  }

  @Mutation(() => Boolean)
  async acceptInvite(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    return this.permissionProvider.accept(workspaceId, user.id);
  }

  @Mutation(() => Boolean)
  async leaveWorkspace(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id);

    return this.permissionProvider.revoke(workspaceId, user.id);
  }

  @Mutation(() => Boolean)
  async sharePage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    return this.permissionProvider.grantPage(workspaceId, pageId);
  }

  @Mutation(() => Boolean)
  async revokePage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    return this.permissionProvider.revokePage(workspaceId, pageId);
  }

  @Query(() => [String], {
    description: 'List blobs of workspace',
  })
  async listBlobs(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id);

    return this.storage.listBlobs(workspaceId);
  }

  @Mutation(() => String)
  async setBlob(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ) {
    await this.permissionProvider.check(workspaceId, user.id, Permission.Write);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = blob.createReadStream();
      const chunks: Uint8Array[] = [];
      stream.on('data', chunk => {
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
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
    await this.permissionProvider.check(workspaceId, user.id);

    return this.storage.deleteBlob(workspaceId, hash);
  }
}
