import { Injectable } from '@nestjs/common';

import { Feature, UserFeatureName } from '../../models';

@Injectable()
export class AvailableUserFeatureConfig {
  availableUserFeatures(): Set<UserFeatureName> {
    return new Set([
      Feature.Admin,
      Feature.UnlimitedCopilot,
      Feature.EarlyAccess,
      Feature.AIEarlyAccess,
    ]);
  }

  configurableUserFeatures(): Set<UserFeatureName> {
    return new Set(
      env.selfhosted
        ? [Feature.Admin, Feature.UnlimitedCopilot]
        : [
            Feature.EarlyAccess,
            Feature.AIEarlyAccess,
            Feature.Admin,
            Feature.UnlimitedCopilot,
          ]
    );
  }
}
