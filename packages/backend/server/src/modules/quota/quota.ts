import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { FeatureService } from './feature';
import { FeatureKind, Quota } from './types';

export const Quotas: Quota[] = [
  {
    feature: 'free_plan_v1',
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // single blob limit 10MB
      blobLimit: 10 * 1024 * 1024,
      // total blob limit 10GB
      storageQuota: 10 * 1024 * 1024 * 1024,
    },
  },
  {
    feature: 'pro_plan_v1',
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // single blob limit 10MB
      blobLimit: 10 * 1024 * 1024,
      // total blob limit 100GB
      storageQuota: 100 * 1024 * 1024 * 1024,
    },
  },
];

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

  async getQuotaByUser(userId: string) {
    const userFeatures = await this.prisma.userFeatureGates.findFirst({
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
    return userFeatures as typeof userFeatures & {
      feature: Pick<Quota, 'feature' | 'configs'>;
    };
  }

  // switch quota by user
  // each user can only have one quota
  async switchQuotaByUser(
    userId: string,
    quota: string,
    reason?: string,
    expiresAt?: Date
  ) {
    await this.prisma.$transaction(async tx => {
      const latestFreePlan = await tx.userFeatures.aggregate({
        where: {
          feature: 'free_plan_v1',
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
