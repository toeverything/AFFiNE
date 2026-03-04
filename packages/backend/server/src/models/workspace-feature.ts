import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { Prisma } from '@prisma/client';

import { BaseModel } from './base';
import {
  type FeatureConfig,
  FeatureType,
  type WorkspaceFeatureName,
} from './common';

@Injectable()
export class WorkspaceFeatureModel extends BaseModel {
  async get<T extends WorkspaceFeatureName>(workspaceId: string, name: T) {
    const workspaceFeature = await this.db.workspaceFeature.findFirst({
      where: {
        workspaceId,
        name,
        activated: true,
      },
    });

    if (!workspaceFeature) {
      return null;
    }

    const feature = await this.models.feature.get_unchecked(name);

    return {
      ...feature,
      configs: this.models.feature.check(name, {
        ...feature.configs,
        ...(workspaceFeature?.configs as {}),
      }),
    };
  }

  async getQuota(workspaceId: string) {
    const quota = await this.db.workspaceFeature.findFirst({
      where: {
        workspaceId,
        type: FeatureType.Quota,
        activated: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!quota) {
      return null;
    }

    const rawFeature = await this.models.feature.get_unchecked(
      quota.name as WorkspaceFeatureName
    );

    const feature = {
      ...rawFeature,
      configs: this.models.feature.check(quota.name as 'team_plan_v1', {
        ...rawFeature.configs,
        ...(quota?.configs as {}),
      }),
    };

    // workspace's storage quota is the sum of base quota and seats * quota per seat
    feature.configs.storageQuota =
      feature.configs.seatQuota * feature.configs.memberLimit +
      feature.configs.storageQuota;

    return feature;
  }

  async has(workspaceId: string, name: WorkspaceFeatureName) {
    const count = await this.db.workspaceFeature.count({
      where: {
        workspaceId,
        name,
        activated: true,
      },
    });

    return count > 0;
  }

  /**
   * helper function to check if a list of workspaces have a standalone quota feature when calculating owner's quota usage
   */
  async batchHasQuota(workspaceIds: string[]) {
    const workspaceFeatures = await this.db.workspaceFeature.findMany({
      select: {
        workspaceId: true,
      },
      where: {
        workspaceId: { in: workspaceIds },
        type: FeatureType.Quota,
        activated: true,
      },
    });

    return workspaceFeatures.map(feature => feature.workspaceId);
  }

  async list(workspaceId: string, type?: FeatureType) {
    const filter: Prisma.WorkspaceFeatureWhereInput =
      type === undefined
        ? {
            workspaceId,
            activated: true,
          }
        : {
            workspaceId,
            activated: true,
            type,
          };

    const workspaceFeatures = await this.db.workspaceFeature.findMany({
      select: {
        name: true,
      },
      where: filter,
    });

    return workspaceFeatures.map(
      workspaceFeature => workspaceFeature.name
    ) as WorkspaceFeatureName[];
  }

  @Transactional()
  async add<T extends WorkspaceFeatureName>(
    workspaceId: string,
    name: T,
    reason: string,
    overrides?: Partial<FeatureConfig<T>>
  ) {
    // ensure feature exists
    await this.models.feature.get_unchecked(name);

    const existing = await this.db.workspaceFeature.findFirst({
      where: {
        workspaceId,
        name: name,
        activated: true,
      },
    });

    if (existing && !overrides) {
      return existing;
    }

    const configs = {
      ...(existing?.configs as {}),
      ...overrides,
    };

    const parseResult = this.models.feature
      .getConfigShape(name)
      .partial()
      .safeParse(configs);

    if (!parseResult.success) {
      throw new Error(`Invalid feature config for ${name}`, {
        cause: parseResult.error,
      });
    }

    let workspaceFeature;
    if (existing) {
      workspaceFeature = await this.db.workspaceFeature.update({
        where: {
          id: existing.id,
        },
        data: {
          configs: parseResult.data,
          reason,
        },
      });
    } else {
      workspaceFeature = await this.db.workspaceFeature.create({
        data: {
          workspaceId,
          name,
          type: this.models.feature.getFeatureType(name),
          activated: true,
          reason,
          configs: parseResult.data,
        },
      });
    }

    this.logger.verbose(`Feature ${name} added to workspace ${workspaceId}`);

    return workspaceFeature;
  }

  async remove(workspaceId: string, featureName: WorkspaceFeatureName) {
    const { count } = await this.db.workspaceFeature.deleteMany({
      where: {
        workspaceId,
        name: featureName,
      },
    });

    if (count > 0) {
      this.logger.verbose(
        `Feature ${featureName} removed from workspace ${workspaceId}`
      );
    }
  }
}
