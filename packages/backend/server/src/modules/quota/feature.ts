import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma';
import { Feature, FeatureKind } from './types';

const Features: Feature[] = [
  {
    name: 'early_access',
    type: FeatureKind.Feature,
    version: 1,
    configs: {
      whitelist: ['@toeverything.info'],
    },
  },
];

@Injectable()
export class FeatureService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // upgrade features from lower version to higher version
    for (const feature of Features) {
      await this.upsertFeature(feature);
    }
  }

  // upgrade features from lower version to higher version
  async upsertFeature(feature: Feature): Promise<void> {
    await this.prisma.userFeatures.upsert({
      where: {
        feature: feature.name,
        version: {
          lt: feature.version,
        },
      },
      update: {
        version: feature.version,
        configs: feature.configs,
      },
      create: {
        feature: feature.name,
        type: feature.type,
        version: feature.version,
        configs: feature.configs,
      },
    });
  }

  async getFeaturesVersion() {
    const features = await this.prisma.userFeatures.findMany({
      select: {
        feature: true,
        version: true,
      },
    });
    return features.reduce(
      (acc, feature) => {
        acc[feature.feature] = feature.version;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async getFeatureConfigs<R extends Prisma.JsonValue = Prisma.JsonValue>(
    feature: string
  ): Promise<R | undefined> {
    const featureConfig = await this.prisma.userFeatures.findUnique({
      where: {
        feature,
      },
    });
    return featureConfig?.configs as R;
  }

  async getFeaturesByUser(userId: string) {
    const userFeatures = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        features: true,
      },
    });
    return userFeatures?.features;
  }

  async hasFeature(userId: string, feature: string) {
    return this.prisma.userFeatureGates
      .count({
        where: {
          userId,
          feature: {
            feature,
          },
        },
      })
      .then(count => count > 0);
  }
}
