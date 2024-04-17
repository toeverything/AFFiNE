import { PrismaClient } from '@prisma/client';

import { QuotaType } from '../../core/quota/types';
import { upgradeLatestQuotaVersion } from './utils/user-quotas';

export class CopilotFeature1713164714634 {
  // do the migration
  static async up(db: PrismaClient) {
    await upgradeLatestQuotaVersion(
      db,
      QuotaType.ProPlanV1,
      'pro plan 1.1 migration'
    );
    await upgradeLatestQuotaVersion(
      db,
      QuotaType.RestrictedPlanV1,
      'restricted plan 1.1 migration'
    );
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
