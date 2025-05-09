import { Module } from '@nestjs/common';

import {
  AdminFeatureManagementResolver,
  UserFeatureResolver,
} from './resolver';
import { EarlyAccessType, FeatureService } from './service';

@Module({
  providers: [
    UserFeatureResolver,
    AdminFeatureManagementResolver,
    FeatureService,
  ],
  exports: [FeatureService],
})
export class FeatureModule {}

export { EarlyAccessType, FeatureService };
export { AvailableUserFeatureConfig } from './types';
