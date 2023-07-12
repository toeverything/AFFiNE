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

import { Metrics } from '../../metrics/metrics';
import { PrismaService } from '../../prisma';
import { StorageProvide } from '../../storage';
import type { FileUpload } from '../../types';
import { Auth, CurrentUser, Public } from '../auth';
import { UserType } from '../users/resolver';
import { PermissionService } from './permission';
import { Permission } from './types';

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
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly metric: Metrics
  ) {}

  @ResolveField(() => Permission, {
    description: 'Permission of current signed in user in workspace',
    complexity: 2,
  })
  async permission(
    @CurrentUser() user: UserType,
    @Parent() workspace: WorkspaceType
  ) {
    this.metric.gqlRequest(1, { operation: 'permission' });
    // may applied in workspaces query
    if ('permission' in workspace) {
      return workspace.permission;
    }

    const permission = this.permissionProvider.get(workspace.id, user.id);

    if (!permission) {
      this.metric.gqlError(1, {
        operation: 'permissionOfSignedUserInWorkspace',
      });
      throw new ForbiddenException();
    }

    return permission;
  }

  @ResolveField(() => Int, {
    description: 'member count of workspace',
    complexity: 2,
  })
  memberCount(@Parent() workspace: WorkspaceType) {
    this.metric.gqlRequest(1, { operation: 'memberCountOfWorkspace' });
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
  sharedPages(@Parent() workspace: WorkspaceType) {
    this.metric.gqlRequest(1, { operation: 'sharedPagesOfWorkspace' });
    return this.permissionProvider.getPages(workspace.id);
  }

  @ResolveField(() => UserType, {
    description: 'Owner of workspace',
    complexity: 2,
  })
  async owner(@Parent() workspace: WorkspaceType) {
    this.metric.gqlRequest(1, { operation: 'ownerOfWorkspace' });
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
    this.metric.gqlRequest(1, { operation: 'membersOfWorkspace' });
    const data = await this.prisma.userWorkspacePermission.findMany({
      where: {
        workspaceId: workspace.id,
      },
      include: {
        user: true,
      },
    });
    return data.map(({ accepted, type, user }) => ({
      ...user,
      permission: type,
      accepted,
    }));
  }

  @Query(() => [WorkspaceType], {
    description: 'Get all accessible workspaces for current user',
    complexity: 2,
  })
  async workspaces(@CurrentUser() user: User) {
    this.metric.gqlRequest(1, { operation: 'workspacesOfCurrentUser' });
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
    this.metric.gqlRequest(1, { operation: 'getPublicWorkspace' });
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    if (workspace?.public) {
      return workspace;
    }

    this.metric.gqlError(1, { operation: 'getPublicWorkspace' });
    throw new NotFoundException("Workspace doesn't exist");
  }

  @Query(() => WorkspaceType, {
    description: 'Get workspace by id',
  })
  async workspace(@CurrentUser() user: UserType, @Args('id') id: string) {
    this.metric.gqlRequest(1, { operation: 'getWorkspaceById' });
    await this.permissionProvider.check(id, user.id);
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });

    if (!workspace) {
      this.metric.gqlError(1, { operation: 'getWorkspaceById' });
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
    this.metric.gqlRequest(1, { operation: 'createWorkspace' });
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

    const storageWorkspace = await this.storage.createWorkspace(workspace.id);
    await this.storage.sync(workspace.id, storageWorkspace.doc.guid, buffer);

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
    this.metric.gqlRequest(1, { operation: 'updateWorkspace' });
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
    this.metric.gqlRequest(1, { operation: 'deleteWorkspace' });
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
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('email') email: string,
    @Args('permission', { type: () => Permission }) permission: Permission
  ) {
    this.metric.gqlRequest(1, { operation: 'inviteToWorkspace' });
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
      this.metric.gqlError(1, { operation: 'inviteToWorkspace' });
      throw new NotFoundException("User doesn't exist");
    }

    await this.permissionProvider.grant(workspaceId, target.id, permission);

    return true;
  }

  @Mutation(() => Boolean)
  async revoke(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    this.metric.gqlRequest(1, { operation: 'revokeWorkspace' });
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    return this.permissionProvider.revoke(workspaceId, userId);
  }

  @Mutation(() => Boolean)
  async acceptInvite(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    this.metric.gqlRequest(1, { operation: 'acceptInvite' });
    return this.permissionProvider.accept(workspaceId, user.id);
  }

  @Mutation(() => Boolean)
  async leaveWorkspace(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    this.metric.gqlRequest(1, { operation: 'leaveWorkspace' });
    await this.permissionProvider.check(workspaceId, user.id);

    return this.permissionProvider.revoke(workspaceId, user.id);
  }

  @Mutation(() => Boolean)
  async sharePage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    this.metric.gqlRequest(1, { operation: 'sharePage' });
    await this.permissionProvider.check(workspaceId, user.id, Permission.Admin);

    return this.permissionProvider.grantPage(workspaceId, pageId);
  }

  @Mutation(() => Boolean)
  async revokePage(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('pageId') pageId: string
  ) {
    this.metric.gqlRequest(1, { operation: 'revokePage' });
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
    this.metric.gqlRequest(1, { operation: 'listBlobs' });
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
    this.metric.gqlRequest(1, { operation: 'setBlob' });
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
    this.metric.gqlRequest(1, { operation: 'deleteBlob' });
    await this.permissionProvider.check(workspaceId, user.id);

    return this.storage.deleteBlob(workspaceId, hash);
  }
}
