import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { StorageModule } from '../storage';
import { PermissionService } from '../workspaces/permission';
import { QuotaService } from './service';
import { QuotaManagementService } from './storage';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  imports: [FeatureModule, StorageModule],
  providers: [PermissionService, QuotaService, QuotaManagementService],
  exports: [QuotaService, QuotaManagementService],
})
export class QuotaModule {}

export { QuotaManagementService, QuotaService };
export { Quota_FreePlanV1_1, Quota_ProPlanV1, Quotas } from './schema';
export { QuotaQueryType, QuotaType } from './types';
