import { Module } from '@nestjs/common';

import { FeatureManagementService } from './management';
import { FeatureService } from './service';

/**
 * Feature module provider pre-user feature flag management.
 * includes:
 * - feature query/update/permit
 * - feature statistics
 */
@Module({
  providers: [FeatureService, FeatureManagementService],
  exports: [FeatureService, FeatureManagementService],
})
export class FeatureModule {}

export { type CommonFeature, commonFeatureSchema } from './types';
export { FeatureKind, Features, FeatureType } from './types';
export { FeatureManagementService, FeatureService };
