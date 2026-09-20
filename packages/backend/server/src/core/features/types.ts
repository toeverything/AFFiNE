import { Injectable } from '@nestjs/common';

import { Feature, UserFeatureName } from '../../models';

@Injectable()
export class AvailableUserFeatureConfig {
  availableUserFeatures(): Set<UserFeatureName> {
    return new Set([Feature.Admin]);
  }

  configurableUserFeatures(): Set<UserFeatureName> {
    return new Set([Feature.Admin]);
  }
}
