import { Features } from '../../modules/features';
import { Quotas } from '../../modules/quota/schema';
import { PrismaService } from '../../prisma';
import { migrateNewFeatureTable, upsertFeature } from './utils/user-features';

export class UserFeaturesInit1698652531198 {
  // do the migration
  static async up(db: PrismaService) {
    // upgrade features from lower version to higher version
    for (const feature of Features) {
      await upsertFeature(db, feature);
    }
    await migrateNewFeatureTable(db);

    for (const quota of Quotas) {
      await upsertFeature(db, quota);
    }
  }

  // revert the migration
  static async down(_db: PrismaService) {
    // TODO: revert the migration
  }
}
