import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { UserType } from '../users/types';
import { WorkspaceType } from '../workspaces/types';
import { FeatureConfigType, getFeature } from './feature';
import { FeatureKind, FeatureType } from './types';

@Injectable()
export class FeatureService {
  constructor(private readonly prisma: PrismaClient) {}

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
        // only keep the latest version
        if (acc[feature.feature]) {
          if (acc[feature.feature] < feature.version) {
            acc[feature.feature] = feature.version;
          }
        } else {
          acc[feature.feature] = feature.version;
        }
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async getFeature<F extends FeatureType>(
    feature: F
  ): Promise<FeatureConfigType<F> | undefined> {
    const data = await this.prisma.features.findFirst({
      where: {
        feature,
        type: FeatureKind.Feature,
      },
      select: { id: true },
      orderBy: {
        version: 'desc',
      },
    });
    if (data) {
      return getFeature(this.prisma, data.id) as FeatureConfigType<F>;
    }
    return undefined;
  }

  // ======== User Features ========

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

  /**
   * get user's features, will included inactivated features
   * @param userId user id
   * @returns list of features
   */
  async getUserFeatures(userId: string) {
    const features = await this.prisma.userFeatures.findMany({
      where: {
        user: { id: userId },
        feature: {
          type: FeatureKind.Feature,
        },
      },
      select: {
        activated: true,
        reason: true,
        createdAt: true,
        expiredAt: true,
        featureId: true,
      },
    });

    const configs = await Promise.all(
      features.map(async feature => ({
        ...feature,
        feature: await getFeature(this.prisma, feature.featureId),
      }))
    );

    return configs.filter(feature => !!feature.feature);
  }

  async listFeatureUsers(feature: FeatureType): Promise<UserType[]> {
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

  async hasUserFeature(userId: string, feature: FeatureType) {
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

  // ======== Workspace Features ========

  async addWorkspaceFeature(
    workspaceId: string,
    feature: FeatureType,
    version: number,
    reason: string,
    expiredAt?: Date | string
  ) {
    return this.prisma.$transaction(async tx => {
      const latestFlag = await tx.workspaceFeatures.findFirst({
        where: {
          workspaceId,
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
        return tx.workspaceFeatures
          .create({
            data: {
              reason,
              expiredAt,
              activated: true,
              workspace: {
                connect: {
                  id: workspaceId,
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

  async removeWorkspaceFeature(workspaceId: string, feature: FeatureType) {
    return this.prisma.workspaceFeatures
      .updateMany({
        where: {
          workspaceId,
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

  /**
   * get workspace's features, will included inactivated features
   * @param workspaceId workspace id
   * @returns list of features
   */
  async getWorkspaceFeatures(workspaceId: string) {
    const features = await this.prisma.workspaceFeatures.findMany({
      where: {
        workspace: { id: workspaceId },
        feature: {
          type: FeatureKind.Feature,
        },
      },
      select: {
        activated: true,
        reason: true,
        createdAt: true,
        expiredAt: true,
        featureId: true,
      },
    });

    const configs = await Promise.all(
      features.map(async feature => ({
        ...feature,
        feature: await getFeature(this.prisma, feature.featureId),
      }))
    );

    return configs.filter(feature => !!feature.feature);
  }

  async listFeatureWorkspaces(feature: FeatureType): Promise<WorkspaceType[]> {
    return this.prisma.workspaceFeatures
      .findMany({
        where: {
          activated: true,
          feature: {
            feature: feature,
            type: FeatureKind.Feature,
          },
        },
        select: {
          workspace: {
            select: {
              id: true,
              public: true,
              createdAt: true,
            },
          },
        },
      })
      .then(wss => wss.map(ws => ws.workspace as WorkspaceType));
  }

  async hasWorkspaceFeature(workspaceId: string, feature: FeatureType) {
    return this.prisma.workspaceFeatures
      .count({
        where: {
          workspaceId,
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
