import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';
import { EarlyAccessFeatureConfig } from './feature';
import { FeatureService } from './service';
import { FeatureType } from './types';

enum NewFeaturesKind {
  EarlyAccess,
}

@Injectable()
export class FeatureManagementService implements OnModuleInit {
  protected logger = new Logger(FeatureManagementService.name);
  private earlyAccessFeature?: EarlyAccessFeatureConfig;
  constructor(
    private readonly feature: FeatureService,
    private readonly prisma: PrismaService,
    private readonly config: Config
  ) {}
  async onModuleInit() {
    this.earlyAccessFeature = await this.feature.getFeature(
      FeatureType.EarlyAccess
    );
  }

  // ======== Admin ========

  // todo(@darkskygit): replace this with abac
  isStaff(email: string) {
    return this.earlyAccessFeature?.checkWhiteList(email) ?? false;
  }

  // ======== Early Access ========

  async addEarlyAccess(userId: string) {
    return this.feature.addUserFeature(
      userId,
      FeatureType.EarlyAccess,
      1,
      'Early access user'
    );
  }

  async removeEarlyAccess(userId: string) {
    return this.feature.removeUserFeature(userId, FeatureType.EarlyAccess);
  }

  async listEarlyAccess() {
    return this.feature.listFeatureUsers(FeatureType.EarlyAccess);
  }

  /// check early access by email
  async canEarlyAccess(email: string) {
    if (this.config.featureFlags.earlyAccessPreview && !this.isStaff(email)) {
      const user = await this.prisma.user.findFirst({
        where: {
          email,
        },
      });
      if (user) {
        const canEarlyAccess = await this.feature
          .hasUserFeature(user.id, FeatureType.EarlyAccess)
          .catch(() => false);
        if (canEarlyAccess) {
          return true;
        }

        // TODO: Outdated, switch to feature gates
        const oldCanEarlyAccess = await this.prisma.newFeaturesWaitingList
          .findUnique({
            where: { email, type: NewFeaturesKind.EarlyAccess },
          })
          .then(x => !!x)
          .catch(() => false);
        if (oldCanEarlyAccess) {
          this.logger.warn(
            `User ${email} has early access in old table but not in new table`
          );
        }
        return oldCanEarlyAccess;
      }
      return false;
    } else {
      return true;
    }
  }

  // ======== Workspace Feature ========
  async addWorkspaceFeatures(
    workspaceId: string,
    feature: FeatureType,
    version?: number,
    reason?: string
  ) {
    const latestVersions = await this.feature.getFeaturesVersion();
    // use latest version if not specified
    const latestVersion = version || latestVersions[feature];
    if (!Number.isInteger(latestVersion)) {
      throw new Error(`Version of feature ${feature} not found`);
    }
    return this.feature.addWorkspaceFeature(
      workspaceId,
      feature,
      latestVersion,
      reason || 'add feature by api'
    );
  }

  async getWorkspaceFeatures(workspaceId: string) {
    const features = await this.feature.getWorkspaceFeatures(workspaceId);
    return features.map(feature => feature.feature.name);
  }

  async hasWorkspaceFeature(workspaceId: string, feature: FeatureType) {
    return this.feature.hasWorkspaceFeature(workspaceId, feature);
  }

  async removeWorkspaceFeature(workspaceId: string, feature: FeatureType) {
    return this.feature
      .removeWorkspaceFeature(workspaceId, feature)
      .then(c => c > 0);
  }

  async listFeatureWorkspaces(feature: FeatureType) {
    return this.feature.listFeatureWorkspaces(feature);
  }
}
