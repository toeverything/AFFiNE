import { ForbiddenException, NotFoundException } from '@nestjs/common';
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

import { PrismaService } from '../../prisma';
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
    private readonly permissionProvider: PermissionService
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

    const permission = this.permissionProvider.get(workspace.id, user.id);

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
  async createWorkspace(@CurrentUser() user: User) {
    return this.prisma.workspace.create({
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

    // TODO:
    // delete all related data, like websocket connections, blobs, etc.

    return true;
  }
}
