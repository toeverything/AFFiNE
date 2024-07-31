import { PrismaClient } from '@prisma/client';

import { Features } from '../../core/features';
import { Quotas } from '../../core/quota/schema';
import { upsertFeature } from './utils/user-features';

export class UserFeaturesInit1698652531198 {
  // do the migration
  static async up(db: PrismaClient) {
    // upgrade features from lower version to higher version
    for (const feature of Features) {
      await upsertFeature(db, feature);
    }

    for (const quota of Quotas) {
      await upsertFeature(db, quota);
    }
  }

  // revert the migration
  static async down(_db: PrismaClient) {
    // noop
  }
}
