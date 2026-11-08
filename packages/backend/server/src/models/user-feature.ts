import { Injectable } from '@nestjs/common';
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

  async list(userId: string, type?: FeatureType, names?: UserFeatureName[]) {
    const filter: Prisma.UserFeatureWhereInput = {
      userId,
      activated: true,
      type,
      name: names ? { in: names } : undefined,
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
}
