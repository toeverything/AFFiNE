import { PrismaClient } from '@prisma/client';

import { Features } from '../../core/features';
import { upsertFeature } from './utils/user-features';

export class RefreshUserFeatures1704352562369 {
  // do the migration
  static async up(db: PrismaClient) {
    // add early access v2 & copilot feature
    for (const feature of Features) {
      await upsertFeature(db, feature);
    }
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
