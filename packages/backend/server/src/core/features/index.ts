import { Module } from '@nestjs/common';

import { UserModule } from '../user';
import { EarlyAccessType, FeatureManagementService } from './management';
import {
  AdminFeatureManagementResolver,
  FeatureManagementResolver,
} from './resolver';
import { FeatureService } from './service';

/**
 * Feature module provider pre-user feature flag management.
 * includes:
 * - feature query/update/permit
 * - feature statistics
 */
@Module({
  imports: [UserModule],
  providers: [
    FeatureService,
    FeatureManagementService,
    FeatureManagementResolver,
    AdminFeatureManagementResolver,
  ],
  exports: [FeatureService, FeatureManagementService],
})
export class FeatureModule {}

export {
  type CommonFeature,
  commonFeatureSchema,
  FeatureKind,
  Features,
  FeatureType,
} from './types';
export { EarlyAccessType, FeatureManagementService, FeatureService };
