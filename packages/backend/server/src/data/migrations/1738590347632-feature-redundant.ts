import { PrismaClient } from '@prisma/client';

import { FeatureConfigs, FeatureName, FeatureType } from '../../models';

export class FeatureRedundant1738590347632 {
  // do the migration
  static async up(db: PrismaClient) {
    const features = await db.feature.findMany();
    const validFeatures = new Map<
      number,
      {
        name: string;
        type: FeatureType;
      }
    >();

    for (const feature of features) {
      const def = FeatureConfigs[feature.name as FeatureName];
      if (!def || def.deprecatedVersion !== feature.deprecatedVersion) {
        await db.feature.delete({
          where: { id: feature.id },
        });
      } else {
        validFeatures.set(feature.id, {
          name: feature.name,
          type: def.type,
        });
      }
    }

    for (const [id, def] of validFeatures.entries()) {
      await db.userFeature.updateMany({
        where: {
          featureId: id,
        },
        data: {
          name: def.name,
          type: def.type,
        },
      });
      await db.workspaceFeature.updateMany({
        where: {
          featureId: id,
        },
        data: {
          name: def.name,
          type: def.type,
        },
      });
    }
  }

  // revert the migration
  static async down(_db: PrismaClient) {
    // noop
  }
}
