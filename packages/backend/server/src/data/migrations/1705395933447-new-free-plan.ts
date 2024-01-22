import { PrismaClient } from '@prisma/client';

import { FeatureKind } from '../../core/features';
import { Quotas } from '../../core/quota';
import { upsertFeature } from './utils/user-features';

export class NewFreePlan1705395933447 {
  // do the migration
  static async up(db: PrismaClient) {
    // add new free plan
    await upsertFeature(db, Quotas[3]);
    // migrate all free plan users to new free plan
    await db.$transaction(async tx => {
      const latestFreePlan = await tx.features.findFirstOrThrow({
        where: { feature: Quotas[3].feature },
        orderBy: { version: 'desc' },
        select: { id: true },
      });

      // find all users that have old free plan
      const userIds = await db.user.findMany({
        where: {
          features: {
            every: {
              feature: {
                type: FeatureKind.Quota,
                feature: Quotas[3].feature,
                version: { lt: Quotas[3].version },
              },
              activated: true,
            },
          },
        },
        select: { id: true },
      });

      // deactivate all old quota for the user
      await tx.userFeatures.updateMany({
        where: {
          id: undefined,
          userId: {
            in: userIds.map(({ id }) => id),
          },
          feature: {
            type: FeatureKind.Quota,
          },
          activated: true,
        },
        data: {
          activated: false,
        },
      });

      await tx.userFeatures.createMany({
        data: userIds.map(({ id: userId }) => ({
          userId,
          featureId: latestFreePlan.id,
          reason: 'free plan 1.0 migration',
          activated: true,
        })),
      });
    });
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
