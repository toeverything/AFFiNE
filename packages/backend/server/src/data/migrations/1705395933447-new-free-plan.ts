import { PrismaClient } from '@prisma/client';

import { Quotas } from '../../core/quota/schema';
import { upgradeQuotaVersion } from './utils/user-quotas';

export class NewFreePlan1705395933447 {
  // do the migration
  static async up(db: PrismaClient) {
    // free plan 1.0
    const quota = Quotas[3];
    await upgradeQuotaVersion(db, quota, 'free plan 1.0 migration');
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
