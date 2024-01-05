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

import { CloudThrottlerGuard, Throttle } from '../../throttler';
import { Auth, CurrentUser } from '../auth';
import { FeatureManagementService, FeatureType } from '../features';
import { UserType } from '../users';
import { WorkspaceType } from './types';

@UseGuards(CloudThrottlerGuard)
@Auth()
@Resolver(() => WorkspaceType)
export class WorkspaceManagementResolver {
  constructor(private readonly feature: FeatureManagementService) {}

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => Int)
  async addWorkspaceFeature(
    @CurrentUser() currentUser: UserType,
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
    @CurrentUser() currentUser: UserType,
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
    @CurrentUser() user: UserType,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<WorkspaceType[]> {
    if (!this.feature.isStaff(user.email)) {
      throw new ForbiddenException('You are not allowed to do this');
    }

    return this.feature.listFeatureWorkspaces(feature);
  }

  @ResolveField(() => [FeatureType], {
    description: 'Enabled features of workspace',
    complexity: 2,
  })
  async features(@Parent() workspace: WorkspaceType): Promise<FeatureType[]> {
    return this.feature.getWorkspaceFeatures(workspace.id);
  }
}
