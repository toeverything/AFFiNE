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

import { PrismaService } from '../../prisma';
import { StorageProvide } from '../../storage';
import type { FileUpload } from '../../types';
import { Auth, CurrentUser } from '../auth';
import { UserType } from '../users/resolver';
import { PermissionService } from './permission';
import { Permission } from './types';

registerEnumType(Permission, {
  name: 'Permission',
  description: 'User permission in workspace',
});

@ObjectType()
export class WorkspaceType implements Partial<Workspace> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'is Public workspace' })
  public!: boolean;

  @Field({ description: 'Workspace created date' })
  createdAt!: Date;
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
    private readonly prisma: PrismaService,
    private readonly permissionProvider: PermissionService,
    @Inject(StorageProvide) private readonly storage: Storage
  ) {}

  @ResolveField(() => Permission, {
    description: 'Permission of current signed in user in workspace',
    complexity: 2,
  })
  async permission(
    @CurrentUser() user: User,
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

  @ResolveField(() => [UserType], {
    description: 'Members of workspace',
    complexity: 2,
  })
  async members(
    @CurrentUser() user: UserType,
    @Parent() workspace: WorkspaceType
  ) {
    const data = await this.prisma.userWorkspacePermission.findMany({
      where: {
        workspaceId: workspace.id,
        accepted: true,
        userId: {
          not: user.id,
        },
      },
      include: {
        user: true,
      },
    });
    return data.map(({ user }) => user);
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
    @CurrentUser() user: User,
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

    await this.storage.createWorkspace(workspace.id, buffer);

    return workspace;
  }

  @Mutation(() => WorkspaceType, {
    description: 'Update workspace',
  })
  async updateWorkspace(
    @CurrentUser() user: User,
    @Args({ name: 'input', type: () => UpdateWorkspaceInput })
    { id, ...updates }: UpdateWorkspaceInput
  ) {
    await this.permissionProvider.check('id', user.id, Permission.Admin);

    return this.prisma.workspace.update({
      where: {
        id,
      },
      data: updates,
    });
  }

  @Mutation(() => Boolean)
  async deleteWorkspace(@CurrentUser() user: User, @Args('id') id: string) {
    await this.permissionProvider.check(id, user.id, Permission.Owner);

    await this.prisma.workspace.delete({
      where: {
        id,
      },
    });

    await this.prisma.userWorkspacePermission.deleteMany({
      where: {
        workspaceId: id,
      },
    });

    // TODO:
    // delete all related data, like websocket connections, blobs, etc.
    await this.storage.deleteWorkspace(id);

    return true;
  }

  @Mutation(() => Boolean)
  async invite(
    @CurrentUser() user: User,
    @Args('workspaceId') workspaceId: string,
    @Args('email') email: string,
    @Args('permission', { type: () => Permission }) permission: Permission
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

    if (!target) {
      throw new NotFoundException("User doesn't exist");
    }

    await this.permissionProvider.grant(workspaceId, target.id, permission);

    return true;
  }

  @Mutation(() => Boolean)
  async revoke(
    @CurrentUser() user: User,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    return this.permissionProvider.revoke(workspaceId, userId);
  }

  @Mutation(() => Boolean)
  async acceptInvite(
    @CurrentUser() user: User,
    @Args('workspaceId') workspaceId: string
  ) {
    return this.permissionProvider.accept(workspaceId, user.id);
  }

  @Mutation(() => Boolean)
  async leaveWorkspace(
    @CurrentUser() user: User,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissionProvider.check(workspaceId, user.id);

    return this.permissionProvider.revoke(workspaceId, user.id);
  }

  @Mutation(() => String)
  async uploadBlob(
    @CurrentUser() user: User,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ) {
    await this.permissionProvider.check(workspaceId, user.id);

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
}
