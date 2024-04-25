import { PrismaClient } from '@prisma/client';

import { FeatureType } from '../../core/features';
import { upsertLatestFeatureVersion } from './utils/user-features';

export class AiEarlyAccess1713176777814 {
  // do the migration
  static async up(db: PrismaClient) {
    await upsertLatestFeatureVersion(db, FeatureType.AIEarlyAccess);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
