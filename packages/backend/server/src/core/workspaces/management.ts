import {
  Args,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { ActionForbidden } from '../../fundamentals';
import { CurrentUser } from '../auth';
import { Admin } from '../common';
import { FeatureManagementService, FeatureType } from '../features';
import { PermissionService } from '../permission';
import { WorkspaceType } from './types';

@Resolver(() => WorkspaceType)
export class WorkspaceManagementResolver {
  constructor(
    private readonly feature: FeatureManagementService,
    private readonly permission: PermissionService
  ) {}

  @Admin()
  @Mutation(() => Int)
  async addWorkspaceFeature(
    @Args('workspaceId') workspaceId: string,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<number> {
    return this.feature.addWorkspaceFeatures(workspaceId, feature);
  }

  @Admin()
  @Mutation(() => Int)
  async removeWorkspaceFeature(
    @Args('workspaceId') workspaceId: string,
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<boolean> {
    return this.feature.removeWorkspaceFeature(workspaceId, feature);
  }

  @Admin()
  @Query(() => [WorkspaceType])
  async listWorkspaceFeatures(
    @Args('feature', { type: () => FeatureType }) feature: FeatureType
  ): Promise<WorkspaceType[]> {
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
      throw new ActionForbidden();
    }

    const owner = await this.permission.getWorkspaceOwner(workspaceId);
    const availableFeatures = await this.availableFeatures(user);
    if (owner.id !== user.id || !availableFeatures.includes(feature)) {
      throw new ActionForbidden();
    }

    if (enable) {
      return await this.feature
        .addWorkspaceFeatures(
          workspaceId,
          feature,
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
    return await this.feature.getActivatedUserFeatures(user.id);
  }

  @ResolveField(() => [FeatureType], {
    description: 'Enabled features of workspace',
    complexity: 2,
  })
  async features(@Parent() workspace: WorkspaceType): Promise<FeatureType[]> {
    return this.feature.getWorkspaceFeatures(workspace.id);
  }
}
