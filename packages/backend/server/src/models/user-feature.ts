import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';

import { BaseModel } from './base';
import { FeatureType, type UserFeatureName } from './common';

@Injectable()
export class UserFeatureModel extends BaseModel {
  async get<T extends UserFeatureName>(userId: string, name: T) {
    const count = await this.db.userFeature.count({
      where: {
        userId,
        name,
        activated: true,
      },
    });

    if (count === 0) {
      return null;
    }

    return await this.models.feature.get(name);
  }

  async getQuota(userId: string) {
    const quota = await this.db.userFeature.findFirst({
      where: {
        userId,
        type: FeatureType.Quota,
        activated: true,
      },
    });

    if (!quota) {
      return null;
    }

    return await this.models.feature.get<'free_plan_v1'>(quota.name as any);
  }

  async has(userId: string, name: UserFeatureName) {
    const count = await this.db.userFeature.count({
      where: {
        userId,
        name,
        activated: true,
      },
    });

    return count > 0;
  }

  async list(userId: string, type?: FeatureType) {
    const filter: Prisma.UserFeatureWhereInput =
      type === undefined
        ? {
            userId,
            activated: true,
          }
        : {
            userId,
            activated: true,
            type,
          };

    const userFeatures = await this.db.userFeature.findMany({
      where: filter,
      select: {
        name: true,
      },
    });

    return userFeatures.map(
      userFeature => userFeature.name
    ) as UserFeatureName[];
  }

  async add(userId: string, name: UserFeatureName, reason: string) {
    // ensure feature exists
    await this.models.feature.get_unchecked(name);
    const existing = await this.db.userFeature.findFirst({
      where: {
        userId,
        name: name,
        activated: true,
      },
    });

    if (existing) {
      return existing;
    }

    const userFeature = await this.db.userFeature.create({
      data: {
        userId,
        name,
        type: this.models.feature.getFeatureType(name),
        activated: true,
        reason,
      },
    });

    this.logger.verbose(`Feature ${name} added to user ${userId}`);

    return userFeature;
  }

  async remove(userId: string, featureName: UserFeatureName) {
    const { count } = await this.db.userFeature.updateMany({
      where: {
        userId,
        name: featureName,
      },
      data: {
        activated: false,
      },
    });

    if (count > 0) {
      this.logger.verbose(
        `Feature ${featureName} deactivated for user ${userId}`
      );
    }
  }

  @Transactional()
  async switchQuota(userId: string, to: UserFeatureName, reason: string) {
    const quotas = await this.list(userId, FeatureType.Quota);

    // deactivate the previous quota
    if (quotas.length) {
      // db state error
      if (quotas.length > 1) {
        this.logger.error(
          `User ${userId} has multiple quotas, please check the database state.`
        );
      }

      const from = quotas.at(-1) as UserFeatureName;

      if (from === to) {
        return;
      }

      await this.remove(userId, from);
    }

    await this.add(userId, to, reason);
  }
}
