import { Injectable } from '@nestjs/common';

import { FeatureKind } from '../features';
import { PrismaService } from './index';
import { Quota, QuotaType } from './types';

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  // get activated user quota
  async getUserQuota(userId: string) {
    const quota = await this.prisma.userFeatures.findFirst({
      where: {
        user: {
          id: userId,
        },
        feature: {
          type: FeatureKind.Quota,
        },
        activated: true,
      },
      select: {
        reason: true,
        createdAt: true,
        expiredAt: true,
        feature: {
          select: {
            feature: true,
            configs: true,
          },
        },
      },
    });
    return quota as typeof quota & {
      feature: Pick<Quota, 'feature' | 'configs'>;
    };
  }

  // get all user quota records
  async getUserQuotas(userId: string) {
    const quotas = await this.prisma.userFeatures.findMany({
      where: {
        user: {
          id: userId,
        },
        feature: {
          type: FeatureKind.Quota,
        },
      },
      select: {
        activated: true,
        reason: true,
        createdAt: true,
        expiredAt: true,
        feature: {
          select: {
            feature: true,
            configs: true,
          },
        },
      },
    });
    return quotas as typeof quotas &
      {
        feature: Pick<Quota, 'feature' | 'configs'>;
      }[];
  }

  // switch user to a new quota
  // currently each user can only have one quota
  async switchUserQuota(
    userId: string,
    quota: QuotaType,
    reason?: string,
    expiredAt?: Date
  ) {
    await this.prisma.$transaction(async tx => {
      const latestFreePlan = await tx.features.aggregate({
        where: {
          feature: QuotaType.Quota_FreePlanV1,
        },
        _max: {
          version: true,
        },
      });

      // we will deactivate all exists quota for this user
      await tx.userFeatures.updateMany({
        where: {
          id: undefined,
          userId,
          feature: {
            type: FeatureKind.Quota,
          },
        },
        data: {
          activated: false,
        },
      });

      await tx.userFeatures.create({
        data: {
          user: {
            connect: {
              id: userId,
            },
          },
          feature: {
            connect: {
              feature_version: {
                feature: quota,
                version: latestFreePlan._max.version || 1,
              },
              type: FeatureKind.Quota,
            },
          },
          reason: reason ?? 'switch quota',
          activated: true,
          expiredAt,
        },
      });
    });
  }

  async hasQuota(userId: string, quota: QuotaType) {
    return this.prisma.userFeatures
      .count({
        where: {
          userId,
          feature: {
            feature: quota,
            type: FeatureKind.Quota,
          },
          activated: true,
        },
      })
      .then(count => count > 0);
  }
}
