import { Injectable, OnModuleInit } from '@nestjs/common';

import { FeatureService } from './feature';
import { PrismaService } from './index';
import { FeatureKind, FeatureType, Quota, Quotas } from './types';

@Injectable()
export class QuotaService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService
  ) {}

  async onModuleInit() {
    for (const quota of Quotas) {
      await this.features.upsertFeature(quota);
    }
  }

  // get activated user quota
  async getUserQuota(userId: string) {
    const quota = await this.prisma.userFeatureGates.findFirst({
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
        expiresAt: true,
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
    const quotas = await this.prisma.userFeatureGates.findMany({
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
        expiresAt: true,
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
    quota: string,
    reason?: string,
    expiresAt?: Date
  ) {
    await this.prisma.$transaction(async tx => {
      const latestFreePlan = await tx.userFeatures.aggregate({
        where: {
          feature: FeatureType.Quota_FreePlanV1,
        },
        _max: {
          version: true,
        },
      });

      // we will deactivate all exists quota for this user
      await tx.userFeatureGates.updateMany({
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

      await tx.userFeatureGates.create({
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
          expiresAt: expiresAt ?? '2099-12-31T23:59:59.999Z',
        },
      });
    });
  }

  async hasQuota(userId: string, quota: string) {
    return this.prisma.userFeatureGates
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
