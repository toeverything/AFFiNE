import { PrismaClient } from '@prisma/client';

import { FeatureType } from '../../core/features';
import { upsertLatestFeatureVersion } from './utils/user-features';

export class UnlimitedCopilot1713285638427 {
  // do the migration
  static async up(db: PrismaClient) {
    await upsertLatestFeatureVersion(db, FeatureType.UnlimitedCopilot);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
