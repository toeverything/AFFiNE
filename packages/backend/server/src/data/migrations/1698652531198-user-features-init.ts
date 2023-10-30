import {
  FeatureKind,
  Features,
  FeatureType,
  upsertFeature,
} from '../../modules/features';
import { Quotas } from '../../modules/quota';
import { PrismaService } from '../../prisma';

export class UserFeaturesInit1698652531198 {
  // do the migration
  static async up(db: PrismaService) {
    // upgrade features from lower version to higher version
    for (const feature of Features) {
      await upsertFeature(db, feature);
    }
    await migrateNewFeatureTable(db);

    for (const quota of Quotas) {
      await upsertFeature(db, quota);
    }
  }

  // revert the migration
  static async down(_db: PrismaService) {
    // TODO: revert the migration
  }
}

async function migrateNewFeatureTable(prisma: PrismaService) {
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
            feature: FeatureType.Feature_EarlyAccess,
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
                feature: FeatureType.Feature_EarlyAccess,
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
                        feature: FeatureType.Feature_EarlyAccess,
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
