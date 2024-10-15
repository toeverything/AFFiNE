import {
  Args,
  Mutation,
  Parent,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { difference } from 'lodash-es';

import { Config } from '../../fundamentals';
import { Admin } from '../common';
import { UserType } from '../user/types';
import { EarlyAccessType, FeatureManagementService } from './management';
import { FeatureService } from './service';
import { FeatureType } from './types';

registerEnumType(EarlyAccessType, {
  name: 'EarlyAccessType',
});

@Resolver(() => UserType)
export class FeatureManagementResolver {
  constructor(private readonly feature: FeatureManagementService) {}

  @ResolveField(() => [FeatureType], {
    name: 'features',
    description: 'Enabled features of a user',
  })
  async userFeatures(@Parent() user: UserType) {
    return this.feature.getActivatedUserFeatures(user.id);
  }
}

export class AvailableUserFeatureConfig {
  constructor(private readonly config: Config) {}

  async availableUserFeatures() {
    return this.config.isSelfhosted
      ? [FeatureType.Admin, FeatureType.UnlimitedCopilot]
      : [FeatureType.EarlyAccess, FeatureType.AIEarlyAccess, FeatureType.Admin];
  }
}

@Admin()
@Resolver(() => Boolean)
export class AdminFeatureManagementResolver extends AvailableUserFeatureConfig {
  constructor(
    config: Config,
    private readonly feature: FeatureService
  ) {
    super(config);
  }

  @Mutation(() => [FeatureType], {
    description: 'update user enabled feature',
  })
  async updateUserFeatures(
    @Args('id') id: string,
    @Args({ name: 'features', type: () => [FeatureType] })
    features: FeatureType[]
  ) {
    const configurableFeatures = await this.availableUserFeatures();

    const removed = difference(configurableFeatures, features);
    await Promise.all(
      features.map(feature =>
        this.feature.addUserFeature(id, feature, 'admin panel')
      )
    );
    await Promise.all(
      removed.map(feature => this.feature.removeUserFeature(id, feature))
    );

    return features;
  }
}
