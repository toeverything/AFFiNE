import { ForbiddenException, UseGuards } from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { CloudThrottlerGuard, Throttle } from '../../fundamentals';
import { CurrentUser } from '../auth';
import { FeatureManagementService, FeatureType } from '../features';
import { PermissionService } from './permission';
import { WorkspaceType } from './types';

@UseGuards(CloudThrottlerGuard)
@Resolver(() => WorkspaceType)
export class WorkspaceManagementResolver {
  constructor(
    private readonly feature: FeatureManagementService,
    private readonly permission: PermissionService
  ) {}

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => Int)
  async addWorkspaceFeature(
    @CurrentUser() currentUser: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<number> {
    if (!this.feature.isStaff(currentUser.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }

    return this.feature.addWorkspaceFeatures(workspaceId, feature);
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => Int)
  async removeWorkspaceFeature(
    @CurrentUser() currentUser: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<boolean> {
    if (!this.feature.isStaff(currentUser.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }

    return this.feature.removeWorkspaceFeature(workspaceId, feature);
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Query(() => [WorkspaceType])
  async listWorkspaceFeatures(
    @CurrentUser() user: CurrentUser,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<WorkspaceType[]> {
    if (!this.feature.isStaff(user.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }

    return this.feature.listFeatureWorkspaces(feature);
  }

  @Mutation(() => Boolean)
  async setWorkspaceExperimentalFeature(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType,
    @Args('enable') enable: boolean
  ): Promise<boolean> {
    if (!(await this.feature.canEarlyAccess(user.email))) {
      throw new ForbiddenException('You are not allowed to do this');
    }

    const owner = await this.permission.getWorkspaceOwner(workspaceId);
    const availableFeatures = await this.availableFeatures(user);
    if (owner.user.id !== user.id || !availableFeatures.includes(feature)) {
      throw new ForbiddenException('You are not allowed to do this');
    }

    if (enable) {
      return await this.feature
        .addWorkspaceFeatures(
          workspaceId,
          feature,
          undefined,
          'add by experimental feature api'
        )
        .then(id => id > 0);
    } else {
      return await this.feature.removeWorkspaceFeature(workspaceId, feature);
    }
  }

  @ResolveField(() => [FeatureType], {
    description: 'Available features of workspace',
    complexity: 2,
  })
  async availableFeatures(
    @CurrentUser() user: CurrentUser
  ): Promise<FeatureType[]> {
    const isEarlyAccessUser = await this.feature.isEarlyAccessUser(user.email);
    if (isEarlyAccessUser) {
      return [FeatureType.Copilot];
    } else {
      return [];
    }
  }

  @ResolveField(() => [FeatureType], {
    description: 'Enabled features of workspace',
    complexity: 2,
  })
  async features(@Parent() workspace: WorkspaceType): Promise<FeatureType[]> {
    return this.feature.getWorkspaceFeatures(workspace.id);
  }
}
