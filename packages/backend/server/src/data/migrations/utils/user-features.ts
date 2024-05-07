import { Prisma, PrismaClient } from '@prisma/client';

import {
  CommonFeature,
  FeatureKind,
  Features,
  FeatureType,
} from '../../../core/features';

// upgrade features from lower version to higher version
export async function upsertFeature(
  db: PrismaClient,
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

export async function migrateNewFeatureTable(prisma: PrismaClient) {
  const waitingList = await prisma.newFeaturesWaitingList.findMany();
  const latestEarlyAccessFeatureId = await prisma.features
    .findFirst({
      where: { feature: FeatureType.EarlyAccess, type: FeatureKind.Feature },
      select: { id: true },
      orderBy: { version: 'desc' },
    })
    .then(r => r?.id);
  if (!latestEarlyAccessFeatureId) {
    throw new Error('Feature EarlyAccess not found');
  }
  for (const oldUser of waitingList) {
    const user = await prisma.user.findFirst({
      where: {
        email: oldUser.email,
      },
    });
    if (user) {
      const hasEarlyAccess = await prisma.userFeatures.count({
        where: {
          userId: user.id,
          feature: {
            feature: FeatureType.EarlyAccess,
          },
          activated: true,
        },
      });
      if (hasEarlyAccess === 0) {
        await prisma.$transaction(async tx => {
          const latestFlag = await tx.userFeatures.findFirst({
            where: {
              userId: user.id,
              feature: {
                feature: FeatureType.EarlyAccess,
                type: FeatureKind.Feature,
              },
              activated: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          if (latestFlag) {
            return latestFlag.id;
          } else {
            return tx.userFeatures
              .create({
                data: {
                  reason: 'Early access user',
                  activated: true,
                  userId: user.id,
                  featureId: latestEarlyAccessFeatureId,
                },
              })
              .then(r => r.id);
          }
        });
      }
    }
  }
}
