import { Features } from '../../modules/features';
import { PrismaService } from '../../prisma';
import { upsertFeature } from './utils/user-features';

export class RefreshUserFeatures1704352562369 {
  // do the migration
  static async up(db: PrismaService) {
    // add early access v2 & copilot feature
    for (const feature of Features) {
      await upsertFeature(db, feature);
    }
  }

  // revert the migration
  static async down(_db: PrismaService) {}
}
