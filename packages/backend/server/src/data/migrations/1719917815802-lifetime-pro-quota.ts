import { PrismaClient } from '@prisma/client';

import { QuotaType } from '../../core/quota';
import { upsertLatestQuotaVersion } from './utils/user-quotas';

export class LifetimeProQuota1719917815802 {
  // do the migration
  static async up(db: PrismaClient) {
    await upsertLatestQuotaVersion(db, QuotaType.LifetimeProPlanV1);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
