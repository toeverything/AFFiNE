import { Prisma, PrismaClient } from '@prisma/client';

import { CommonFeature, Features, FeatureType } from '../../../core/features';

// upgrade features from lower version to higher version
export async function upsertFeature(
  db: PrismaClient,
  feature: CommonFeature
): Promise<void> {
  const hasEqualOrGreaterVersion =
    (await db.feature.count({
      where: {
        feature: feature.feature,
        version: {
          gte: feature.version,
        },
      },
    })) > 0;
  // will not update exists version
  if (!hasEqualOrGreaterVersion) {
    await db.feature.create({
      data: {
        feature: feature.feature,
        type: feature.type,
        version: feature.version,
        configs: feature.configs as Prisma.InputJsonValue,
      },
    });
  }
}

export async function upsertLatestFeatureVersion(
  db: PrismaClient,
  type: FeatureType
) {
  const feature = Features.filter(f => f.feature === type);
  feature.sort((a, b) => b.version - a.version);
  const latestFeature = feature[0];
  await upsertFeature(db, latestFeature);
}
