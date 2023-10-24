import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../prisma';
import { migrateNewFeatureTable } from './migration';
import { CommonFeature, Feature, FeatureKind } from './types';

const Features: Feature[] = [
  {
    feature: 'early_access',
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
      await migrateNewFeatureTable(this, this.prisma);
    }
  }

  // upgrade features from lower version to higher version
  async upsertFeature(feature: CommonFeature): Promise<void> {
    const hasEqualOrGreaterVersion =
      (await this.prisma.userFeatures.count({
        where: {
          feature: feature.feature,
          version: {
            gte: feature.version,
          },
        },
      })) > 0;
    // will not update exists version
    if (!hasEqualOrGreaterVersion) {
      await this.prisma.userFeatures.create({
        data: {
          feature: feature.feature,
          type: feature.type,
          version: feature.version,
          configs: feature.configs,
        },
      });
    }
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

  async getFeature(feature: string) {
    return this.prisma.userFeatures.findFirst({
      where: {
        feature,
      },
      orderBy: {
        version: 'desc',
      },
    });
  }

  async addUserFeature(
    userId: string,
    feature: string,
    version: number,
    reason: string,
    expiresAt?: Date | string
  ) {
    return this.prisma.userFeatureGates
      .create({
        data: {
          reason,
          expiresAt: expiresAt ?? '2099-12-31T23:59:59.999Z',
          user: {
            connect: {
              id: userId,
            },
          },
          feature: {
            connect: {
              feature_version: {
                feature,
                version,
              },
            },
          },
        },
      })
      .then(r => r.id);
  }

  async removeUserFeature(userId: string, feature: string) {
    return this.prisma.userFeatureGates
      .deleteMany({
        where: {
          userId,
          feature: {
            feature,
          },
        },
      })
      .then(r => r.count);
  }

  async getUserFeatures(userId: string) {
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

  async listFeatureUsers(feature: string) {
    return this.prisma.userFeatureGates
      .findMany({
        where: {
          feature: {
            feature: feature,
          },
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              email: true,
              emailVerified: true,
              createdAt: true,
            },
          },
        },
      })
      .then(users => users.map(user => user.user));
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
