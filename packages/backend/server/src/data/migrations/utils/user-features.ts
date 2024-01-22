import { Prisma, PrismaClient } from '@prisma/client';

import {
  CommonFeature,
  FeatureKind,
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

export async function migrateNewFeatureTable(prisma: PrismaClient) {
  const waitingList = await prisma.newFeaturesWaitingList.findMany();
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
                  user: {
                    connect: {
                      id: user.id,
                    },
                  },
                  feature: {
                    connect: {
                      feature_version: {
                        feature: FeatureType.EarlyAccess,
                        version: 1,
                      },
                      type: FeatureKind.Feature,
                    },
                  },
                },
              })
              .then(r => r.id);
          }
        });
      }
    }
  }
}
