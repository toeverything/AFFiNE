import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { QuotaService, QuotaType } from '../../core/quota';
import { UserService } from '../../core/user';
import { Config } from '../../fundamentals';
import { upgradeLatestQuotaVersion } from './utils/user-quotas';

export class RefreshNewPlan1713258139569 {
  // do the migration
  static async up(db: PrismaClient, ref: ModuleRef) {
    const config = ref.get(Config, { strict: false });
    const { AFFINE_ADMIN_EMAIL } = process.env;
    if (config.isSelfhosted && AFFINE_ADMIN_EMAIL) {
      const user = ref.get(UserService, { strict: false });
      const quota = ref.get(QuotaService, { strict: false });
      const { id } = (await user.findUserByEmail(AFFINE_ADMIN_EMAIL)) || {};
      if (id) {
        await upgradeLatestQuotaVersion(db, QuotaType.UnlimitedPlanV1, '');
        await quota.switchUserQuota(id, QuotaType.UnlimitedPlanV1);
      }
    }
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
