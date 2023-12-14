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
          .hasFeature(user.id, FeatureType.EarlyAccess)
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
}
