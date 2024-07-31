import { PrismaClient } from '@prisma/client';

import { FeatureKind } from '../../../core/features';
import { getLatestQuota } from '../../../core/quota/schema';
import { Quota, QuotaType } from '../../../core/quota/types';
import { upsertFeature } from './user-features';

export async function upgradeQuotaVersion(
  db: PrismaClient,
  quota: Quota,
  reason: string
) {
  // add new quota
  await upsertFeature(db, quota);
  // migrate all users that using old quota to new quota
  await db.$transaction(
    async tx => {
      const latestQuotaVersion = await tx.feature.findFirstOrThrow({
        where: { feature: quota.feature },
        orderBy: { version: 'desc' },
        select: { id: true },
      });

      // find all users that have old free plan
      const userIds = await tx.user.findMany({
        where: {
          features: {
            some: {
              feature: {
                type: FeatureKind.Quota,
                feature: quota.feature,
                version: { lt: quota.version },
              },
              activated: true,
            },
          },
        },
        select: { id: true },
      });

      // deactivate all old quota for the user
      await tx.userFeature.updateMany({
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

      await tx.userFeature.createMany({
        data: userIds.map(({ id: userId }) => ({
          userId,
          featureId: latestQuotaVersion.id,
          reason,
          activated: true,
        })),
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );
}

export async function upsertLatestQuotaVersion(
  db: PrismaClient,
  type: QuotaType
) {
  const latestQuota = getLatestQuota(type);
  await upsertFeature(db, latestQuota);
}

export async function upgradeLatestQuotaVersion(
  db: PrismaClient,
  type: QuotaType,
  reason: string
) {
  const latestQuota = getLatestQuota(type);
  await upgradeQuotaVersion(db, latestQuota, reason);
}
