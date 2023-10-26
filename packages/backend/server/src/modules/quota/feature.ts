import { Injectable, Logger } from '@nestjs/common';

import { Config } from '../../config';
import { FeatureService, PrismaService } from './configure';
import { FeatureType } from './configure/types';

export enum NewFeaturesKind {
  EarlyAccess,
}

@Injectable()
export class FeatureManagementService {
  protected logger = new Logger(FeatureManagementService.name);
  constructor(
    private readonly feature: FeatureService,
    private readonly prisma: PrismaService,
    private readonly config: Config
  ) {}

  isStaff(email: string) {
    return email.endsWith('@toeverything.info');
  }

  async addEarlyAccess(userId: string) {
    return this.feature.addUserFeature(
      userId,
      FeatureType.Feature_EarlyAccess,
      1,
      'Early access user'
    );
  }

  async removeEarlyAccess(userId: string) {
    return this.feature.removeUserFeature(
      userId,
      FeatureType.Feature_EarlyAccess
    );
  }

  async listEarlyAccess() {
    return this.feature.listFeatureUsers(FeatureType.Feature_EarlyAccess);
  }

  async canEarlyAccess(email: string) {
    if (
      this.config.featureFlags.earlyAccessPreview &&
      !email.endsWith('@toeverything.info')
    ) {
      const user = await this.prisma.user.findFirst({
        where: {
          email,
        },
      });
      if (user) {
        const canEarlyAccess = await this.feature
          .hasFeature(user.id, FeatureType.Feature_EarlyAccess)
          .catch(() => false);
        // TODO: Outdated, switch to feature gates
        const oldCanEarlyAccess = await this.prisma.newFeaturesWaitingList
          .findUnique({
            where: { email, type: NewFeaturesKind.EarlyAccess },
          })
          .then(x => !!x)
          .catch(() => false);
        if (!canEarlyAccess && oldCanEarlyAccess) {
          this.logger.warn(
            `User ${email} has early access in old table but not in new table`
          );
        }

        return canEarlyAccess || oldCanEarlyAccess;
      }
      return false;
    } else {
      return true;
    }
  }
}
