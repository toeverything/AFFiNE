import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { WorkspaceType } from '../workspaces/types';
import { FeatureConfigType, getFeature } from './feature';
import { FeatureKind, FeatureType } from './types';

@Injectable()
export class FeatureService {
  constructor(private readonly prisma: PrismaClient) {}

  async getFeature<F extends FeatureType>(feature: F) {
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
      return getFeature(this.prisma, data.id) as Promise<FeatureConfigType<F>>;
    }
    return undefined;
  }

  // ======== User Features ========

  async addUserFeature(
    userId: string,
    feature: FeatureType,
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
        const featureId = await tx.features
          .findFirst({
            where: { feature, type: FeatureKind.Feature },
            orderBy: { version: 'desc' },
            select: { id: true },
          })
          .then(r => r?.id);

        if (!featureId) {
          throw new Error(`Feature ${feature} not found`);
        }

        return tx.userFeatures
          .create({
            data: {
              reason,
              expiredAt,
              activated: true,
              userId,
              featureId,
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
        userId,
        feature: { type: FeatureKind.Feature },
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

  async getActivatedUserFeatures(userId: string) {
    const features = await this.prisma.userFeatures.findMany({
      where: {
        userId,
        feature: { type: FeatureKind.Feature },
        activated: true,
        OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
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
              emailVerifiedAt: true,
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
          OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
        },
      })
      .then(count => count > 0);
  }

  // ======== Workspace Features ========

  async addWorkspaceFeature(
    workspaceId: string,
    feature: FeatureType,
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
        // use latest version of feature
        const featureId = await tx.features
          .findFirst({
            where: { feature, type: FeatureKind.Feature },
            select: { id: true },
            orderBy: { version: 'desc' },
          })
          .then(r => r?.id);

        if (!featureId) {
          throw new Error(`Feature ${feature} not found`);
        }

        return tx.workspaceFeatures
          .create({
            data: {
              reason,
              expiredAt,
              activated: true,
              workspaceId,
              featureId,
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
