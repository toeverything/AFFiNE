import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { FeatureService } from './configure';
import { FeatureManagementService } from './feature';
import type { CommonFeature } from './types';

// upgrade features from lower version to higher version
async function upsertFeature(
  db: PrismaService,
  feature: CommonFeature
): Promise<void> {
  const hasEqualOrGreaterVersion =
    (await db.features.count({
      where: {
        feature: feature.feature,
        version: {
          gte: feature.version,
        },
      },
    })) > 0;
  // will not update exists version
  if (!hasEqualOrGreaterVersion) {
    await db.features.create({
      data: {
        feature: feature.feature,
        type: feature.type,
        version: feature.version,
        configs: feature.configs,
      },
    });
  }
}

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  providers: [FeatureService, FeatureManagementService],
  exports: [FeatureService, FeatureManagementService],
})
export class FeatureModule {}

export {
  CommonFeature,
  Feature,
  FeatureKind,
  Features,
  FeatureType,
} from './types';
export {
  FeatureManagementService,
  FeatureService,
  PrismaService,
  upsertFeature,
};
