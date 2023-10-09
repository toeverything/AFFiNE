import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';

const Features = [
  {
    name: 'early_access',
    version: 1,
    configs: {
      whitelist: ['@toeverything.info'],
    },
  },
];

@Injectable()
export class FeatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: Config
  ) {}

  async initFeatures() {
    // upgrade features from lower version to higher version
    for (const feature of Features) {
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
          version: feature.version,
          configs: feature.configs,
        },
      });
    }
  }

  public async getFeatureConfigs<R extends Prisma.JsonValue = Prisma.JsonValue>(
    feature: string
  ): Promise<R | undefined> {
    const featureConfig = await this.prisma.userFeatures.findUnique({
      where: {
        feature,
      },
    });
    return featureConfig?.configs as R;
  }

  public async setFeatureConfigs<
    R extends Prisma.InputJsonValue = Prisma.InputJsonValue,
  >(feature: string, configs: R): Promise<void> {
    await this.prisma.userFeatures.upsert({
      where: {
        feature,
      },
      update: {
        configs: configs,
      },
      create: {
        feature,
        configs,
      },
    });
  }

  public async getFeaturesByUser(userId: string) {
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
}
