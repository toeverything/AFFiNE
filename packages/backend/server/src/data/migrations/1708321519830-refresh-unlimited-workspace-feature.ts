import { PrismaClient } from '@prisma/client';

import { Features } from '../../core/features';
import { upsertFeature } from './utils/user-features';

export class RefreshUnlimitedWorkspaceFeature1708321519830 {
  // do the migration
  static async up(db: PrismaClient) {
    // add unlimited workspace feature
    const feature = Features[3];
    await upsertFeature(db, feature);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
