import {
  Args,
  Field,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import type { FileUpload } from '../../../base';
import {
  AFFiNELogger,
  BlobQuotaExceeded,
  readBuffer,
  registerObjectType,
  SpaceAccessDenied,
  SpaceNotFound,
  StorageQuotaExceeded,
} from '../../../base';
import { Models } from '../../../models';
import { CurrentUser } from '../../auth';
import {
  AccessController,
  WORKSPACE_ACTIONS,
  WorkspaceAction,
  WorkspaceRole,
} from '../../permission';
import { QuotaService, WorkspaceQuotaType } from '../../quota';
import { NotificationService } from '../../notification/service';
import { WorkspaceBlobStorage } from '../../storage';
import { WorkspaceService } from '../service';
import { UpdateWorkspaceInput, WorkspaceType } from '../types';

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
    private readonly ac: AccessController,
    private readonly quota: QuotaService,
    private readonly models: Models,
    private readonly workspaceService: WorkspaceService,
    private readonly notificationService: NotificationService,
    private readonly storage: WorkspaceBlobStorage,
    private readonly logger: AFFiNELogger
  ) {
    logger.setContext(WorkspaceResolver.name);
  }

  @ResolveField(() => Boolean, {
    description: 'is current workspace initialized',
    complexity: 2,
  })
  async initialized(@Parent() workspace: WorkspaceType) {
    return this.models.doc.exists(workspace.id, workspace.id);
  }

  @ResolveField(() => Boolean, {
    name: 'team',
    description: 'if workspace is team workspace',
    complexity: 2,
  })
  team(@Parent() workspace: WorkspaceType) {
    return this.workspaceService.isTeamWorkspace(workspace.id);
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

  @ResolveField(() => [CurriculumDocumentType], {
    description: 'Uploaded curriculum documents',
    complexity: 2,
  })
  async curriculumDocuments(
    @Parent() workspace: WorkspaceType
  ): Promise<CurriculumDocumentType[]> {
    const blobs = await this.storage.list(workspace.id);
    
    // Filter blobs that start with "curriculum-" prefix
    const curriculumBlobs = blobs.filter(blob => 
      blob.key.startsWith('curriculum-')
    );

    return curriculumBlobs.map(blob => ({
      filename: blob.key.replace('curriculum-', ''),
      key: blob.key,
      size: blob.size,
      mime: blob.mime,
      createdAt: blob.createdAt,
      downloadUrl: `/api/workspaces/${workspace.id}/curriculum/${blob.key}`,
    }));
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

  @Mutation(() => String, {
    description: 'Upload curriculum document and notify all users',
  })
  async uploadCurriculum(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'curriculum', type: () => GraphQLUpload })
    curriculum: FileUpload
  ) {
    // Check if user is owner
    const role = await this.models.workspaceUser.getActive(workspaceId, user.id);
    if (!role || role.type !== WorkspaceRole.Owner) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }

    // Check quota
    const checkExceeded =
      await this.quota.getWorkspaceQuotaCalculator(workspaceId);

    let result = checkExceeded(0);
    if (result?.blobQuotaExceeded) {
      throw new BlobQuotaExceeded();
    } else if (result?.storageQuotaExceeded) {
      throw new StorageQuotaExceeded();
    }

    // Upload the file with curriculum prefix
    const key = `curriculum-${curriculum.filename}`;
    const buffer = await readBuffer(curriculum.createReadStream(), checkExceeded);
    await this.storage.put(workspaceId, key, buffer);

    // Get all members of the workspace
    const workspaceUsers = await this.models.workspaceUser.paginate(workspaceId, { first: 1000, offset: 0 });
    const members = workspaceUsers[0].map(wu => ({ userId: wu.userId }));

    // Send notification to all members
    const notifications = members.map(member =>
      this.notificationService.createSystem({
        userId: member.userId,
        body: {
          workspaceId,
          createdByUserId: user.id,
          message: 'A new curriculum has been uploaded.',
        },
      })
    );

    await Promise.all(notifications);

    return curriculum.filename;
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
}
