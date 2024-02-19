import { PrismaClient } from '@prisma/client';

import { FeatureType } from '../../core/features';
import { upsertLatestFeatureVersion } from './utils/user-features';

export class RefreshUnlimitedWorkspaceFeature1708321519830 {
  // do the migration
  static async up(db: PrismaClient) {
    // add unlimited workspace feature
    await upsertLatestFeatureVersion(db, FeatureType.UnlimitedWorkspace);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
