import { PrismaClient } from '@prisma/client';

import { FeatureType } from '../../core/features';
import { upsertLatestFeatureVersion } from './utils/user-features';

export class AdministratorFeature1716195522794 {
  // do the migration
  static async up(db: PrismaClient) {
    await upsertLatestFeatureVersion(db, FeatureType.Admin);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
