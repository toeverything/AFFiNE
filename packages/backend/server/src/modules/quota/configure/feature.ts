import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../prisma';
import { migrateNewFeatureTable } from './migration';
import { CommonFeature, Feature, FeatureKind, FeatureType } from './types';

const Features: Feature[] = [
  {
    feature: FeatureType.Feature_EarlyAccess,
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
      (await this.prisma.features.count({
        where: {
          feature: feature.feature,
          version: {
            gte: feature.version,
          },
        },
      })) > 0;
    // will not update exists version
    if (!hasEqualOrGreaterVersion) {
      await this.prisma.features.create({
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
    const features = await this.prisma.features.findMany({
      where: {
        type: FeatureKind.Feature,
      },
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

  async getFeature(feature: FeatureType) {
    return this.prisma.features.findFirst({
      where: {
        feature,
        type: FeatureKind.Feature,
      },
      orderBy: {
        version: 'desc',
      },
    });
  }

  async addUserFeature(
    userId: string,
    feature: FeatureType,
    version: number,
    reason: string,
    expiredAt?: Date | string
  ) {
    return this.prisma.$transaction(async tx => {
      const latestFlag = await tx.userFeatures.findFirst({
        where: {
          userId,
          feature: {
            feature,
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
              reason,
              expiredAt,
              activated: true,
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
                  type: FeatureKind.Feature,
                },
              },
            },
          })
          .then(r => r.id);
      }
    });
  }

  async removeUserFeature(userId: string, feature: FeatureType) {
    return this.prisma.userFeatures
      .updateMany({
        where: {
          userId,
          feature: {
            feature,
            type: FeatureKind.Feature,
          },
          activated: true,
        },
        data: {
          activated: false,
        },
      })
      .then(r => r.count);
  }

  async getUserFeatures(userId: string) {
    const userFeatures = await this.prisma.userFeatures.findMany({
      where: {
        user: { id: userId },
        activated: true,
        feature: {
          type: FeatureKind.Feature,
        },
      },
      select: {
        feature: true,
      },
    });
    return userFeatures.map(userFeature => userFeature.feature);
  }

  async listFeatureUsers(feature: FeatureType) {
    return this.prisma.userFeatures
      .findMany({
        where: {
          activated: true,
          feature: {
            feature: feature,
            type: FeatureKind.Feature,
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

  async hasFeature(userId: string, feature: FeatureType) {
    return this.prisma.userFeatures
      .count({
        where: {
          userId,
          activated: true,
          feature: {
            feature,
            type: FeatureKind.Feature,
          },
        },
      })
      .then(count => count > 0);
  }
}
