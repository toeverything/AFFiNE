import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { FeatureService } from './feature';
import { FeatureKind, Quota } from './types';

const Quotas: Quota[] = [
  {
    name: 'free_plan_v1',
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // single blob limit 10MB
      blob_single_limit: 10 * 1024 * 1024,
      // total blob limit 10GB
      blob_total_limit: 10 * 1024 * 1024 * 1024,
    },
  },
  {
    name: 'pro_plan_v1',
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // single blob limit 10MB
      blob_single_limit: 10 * 1024 * 1024,
      // total blob limit 10GB
      blob_total_limit: 10 * 1024 * 1024 * 1024,
    },
  },
];

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService
  ) {}

  async initQuota() {
    await this.features.initFeatures();
    for (const quota of Quotas) {
      await this.features.upsertFeature(quota);
    }
  }

  async getQuotaByUser(userId: string) {
    const userFeatures = await this.prisma.userFeatureGates.findUnique({
      where: {
        id: userId,
        feature: {
          type: FeatureKind.Quota,
        },
      },
    });
    return userFeatures;
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
        },
      })
      .then(count => count > 0);
  }
}
