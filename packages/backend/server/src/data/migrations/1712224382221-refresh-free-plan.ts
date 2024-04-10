import { PrismaClient } from '@prisma/client';

import { Quotas } from '../../core/quota';
import { upgradeQuotaVersion } from './utils/user-quotas';

export class RefreshFreePlan1712224382221 {
  // do the migration
  static async up(db: PrismaClient) {
    // free plan 1.0
    const quota = Quotas[4];
    await upgradeQuotaVersion(db, quota, 'free plan 1.1 migration');
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
