import {
  Args,
  Context,
  Field,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { Request } from 'express';
import GraphQLUpload, {
  type FileUpload,
} from 'graphql-upload/GraphQLUpload.mjs';

import {
  BlobQuotaExceeded,
  CopilotEmbeddingUnavailable,
  CopilotFailedToAddWorkspaceArtifact,
  Mutex,
  paginate,
  PaginationInput,
  TooManyRequest,
  UserFriendlyError,
} from '../../../base';
import { CurrentUser } from '../../../core/auth';
import { PermissionAccess } from '../../../core/permission';
import { WorkspaceType } from '../../../core/workspaces';
import { CopilotEnabled } from '../feature';
import { COPILOT_LOCKER } from '../resolver';
import { MAX_EMBEDDABLE_SIZE } from '../utils';
import { CopilotWorkspaceService } from './service';
import {
  CopilotWorkspaceArtifactType,
  CopilotWorkspaceIgnoredDocType,
  PaginatedCopilotWorkspaceArtifactType,
  PaginatedIgnoredDocsType,
} from './types';

@ObjectType('CopilotWorkspaceConfig')
export class CopilotWorkspaceConfigType {
  @Field(() => String)
  workspaceId!: string;
}

/**
 * Workspace embedding config resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@CopilotEnabled()
@Resolver(() => WorkspaceType)
export class CopilotWorkspaceEmbeddingResolver {
  constructor(private readonly ac: PermissionAccess) {}

  @ResolveField(() => CopilotWorkspaceConfigType, {
    complexity: 2,
  })
  async embedding(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ): Promise<CopilotWorkspaceConfigType> {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Read');

    return { workspaceId: workspace.id };
  }
}

@CopilotEnabled()
@Resolver(() => CopilotWorkspaceConfigType)
export class CopilotWorkspaceEmbeddingConfigResolver {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly mutex: Mutex,
    private readonly copilotWorkspace: CopilotWorkspaceService
  ) {}

  @ResolveField(() => PaginatedIgnoredDocsType, {
    complexity: 2,
  })
  async ignoredDocs(
    @Parent() config: CopilotWorkspaceConfigType,
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput
  ): Promise<PaginatedIgnoredDocsType> {
    const [ignoredDocs, totalCount] =
      await this.copilotWorkspace.listIgnoredDocs(
        config.workspaceId,
        pagination
      );

    return paginate(ignoredDocs, 'createdAt', pagination, totalCount);
  }

  @ResolveField(() => [CopilotWorkspaceIgnoredDocType], {
    complexity: 2,
  })
  async allIgnoredDocs(
    @Parent() config: CopilotWorkspaceConfigType
  ): Promise<CopilotWorkspaceIgnoredDocType[]> {
    const [ignoredDocs] = await this.copilotWorkspace.listIgnoredDocs(
      config.workspaceId
    );

    return ignoredDocs;
  }

  @Mutation(() => Number, {
    name: 'updateWorkspaceEmbeddingIgnoredDocs',
    complexity: 2,
    description: 'Update ignored docs',
  })
  async updateIgnoredDocs(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { type: () => String })
    workspaceId: string,
    @Args('add', { type: () => [String], nullable: true })
    add?: string[],
    @Args('remove', { type: () => [String], nullable: true })
    remove?: string[]
  ): Promise<number> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Settings.Update');
    return await this.copilotWorkspace.updateIgnoredDocs(
      workspaceId,
      add,
      remove
    );
  }

  @ResolveField(() => PaginatedCopilotWorkspaceArtifactType, {
    complexity: 2,
  })
  async artifacts(
    @Parent() config: CopilotWorkspaceConfigType,
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput
  ): Promise<PaginatedCopilotWorkspaceArtifactType> {
    const [artifacts, totalCount] = await this.copilotWorkspace.listArtifacts(
      config.workspaceId,
      pagination
    );

    return paginate(artifacts, 'createdAt', pagination, totalCount);
  }

  @Mutation(() => CopilotWorkspaceArtifactType, {
    name: 'addWorkspaceArtifact',
    complexity: 2,
    description: 'Add a workspace artifact',
  })
  async addArtifact(
    @Context() ctx: { req: Request },
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { type: () => String })
    workspaceId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    content: FileUpload
  ): Promise<CopilotWorkspaceArtifactType> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Settings.Update');

    if (!this.copilotWorkspace.canEmbedding) {
      throw new CopilotEmbeddingUnavailable();
    }

    const lockFlag = `${COPILOT_LOCKER}:workspace:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      throw new TooManyRequest('Server is busy');
    }

    const length = Number(ctx.req.headers['content-length']);
    if (length && length >= MAX_EMBEDDABLE_SIZE) {
      throw new BlobQuotaExceeded();
    }

    try {
      return await this.copilotWorkspace.addArtifact(workspaceId, content);
    } catch (e) {
      // passthrough user friendly error
      if (e instanceof UserFriendlyError) {
        throw e;
      }
      throw new CopilotFailedToAddWorkspaceArtifact({
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  @Mutation(() => Boolean, {
    name: 'removeWorkspaceArtifact',
    complexity: 2,
    description: 'Remove a workspace artifact',
  })
  async removeArtifact(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId', { type: () => String })
    workspaceId: string,
    @Args('artifactId', { type: () => String })
    artifactId: string
  ): Promise<boolean> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Settings.Update');

    return await this.copilotWorkspace.removeArtifact(workspaceId, artifactId);
  }
}
