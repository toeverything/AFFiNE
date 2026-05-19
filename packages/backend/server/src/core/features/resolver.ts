import {
  Args,
  Int,
  Mutation,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { difference } from 'lodash-es';

import { BadRequest, EventBus } from '../../base';
import { Feature, Models, type UserFeatureName } from '../../models';
import { Admin } from '../common';
import { EntitlementService } from '../entitlement';
import { UserType } from '../user/types';
import { AvailableUserFeatureConfig } from './types';

registerEnumType(Feature, {
  name: 'FeatureType',
});

@Resolver(() => UserType)
export class UserFeatureResolver extends AvailableUserFeatureConfig {
  constructor(private readonly models: Models) {
    super();
  }

  @ResolveField(() => [Feature], {
    name: 'features',
    description: 'Enabled features of a user',
  })
  async userFeatures(@Parent() user: UserType) {
    const features = await this.models.userFeature.list(user.id);
    const availableUserFeatures = this.availableUserFeatures();
    return features.filter(feature => availableUserFeatures.has(feature));
  }
}

@Admin()
@Resolver(() => Boolean)
export class AdminFeatureManagementResolver extends AvailableUserFeatureConfig {
  constructor(
    private readonly models: Models,
    private readonly entitlement: EntitlementService,
    private readonly event: EventBus
  ) {
    super();
  }

  @Mutation(() => [Feature], {
    description: 'update user enabled feature',
  })
  async updateUserFeatures(
    @Args('id') id: string,
    @Args({ name: 'features', type: () => [Feature] })
    features: UserFeatureName[]
  ) {
    const configurableUserFeatures = this.configurableUserFeatures();
    const unsupported = features.filter(
      feature => !configurableUserFeatures.has(feature)
    );
    if (unsupported.length) {
      throw new BadRequest(
        `User feature ${unsupported.join(', ')} is not configurable`
      );
    }
    const removed = difference(Array.from(configurableUserFeatures), features);

    await Promise.all(
      features.map(feature =>
        this.models.userFeature.add(id, feature, 'admin panel')
      )
    );

    await Promise.all(
      removed.map(feature => this.models.userFeature.remove(id, feature))
    );

    const user = await this.models.user.get(id);
    if (user) {
      this.event.emit('user.updated', user);
    }

    return features;
  }

  @Mutation(() => Boolean)
  async grantCommercialEntitlement(
    @Args('targetType', { type: () => String })
    targetType: 'user' | 'workspace',
    @Args('targetId', { type: () => String }) targetId: string,
    @Args('plan', { type: () => String }) plan: string,
    @Args('quantity', { type: () => Int, nullable: true }) quantity?: number
  ) {
    await this.entitlement.upsertAdminGrant({
      targetType,
      targetId,
      plan,
      quantity,
    });
    return true;
  }

  @Mutation(() => Boolean)
  async revokeCommercialEntitlement(
    @Args('targetType', { type: () => String })
    targetType: 'user' | 'workspace',
    @Args('targetId', { type: () => String }) targetId: string
  ) {
    await this.entitlement.revokeAdminGrant(targetType, targetId);
    return true;
  }
}
