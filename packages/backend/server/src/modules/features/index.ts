import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { FeatureService } from './configure';
import { FeatureManagementService } from './feature';

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

export type { CommonFeature, Feature } from './types';
export { FeatureKind, Features, FeatureType } from './types';
export { FeatureManagementService, FeatureService, PrismaService };
