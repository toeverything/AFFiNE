import { Module } from '@nestjs/common';

import { PermissionService } from '../workspaces/permission';
import { QuotaService } from './quota';
import { QuotaManagementService } from './storage';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  providers: [PermissionService, QuotaService, QuotaManagementService],
  exports: [QuotaService, QuotaManagementService],
})
export class QuotaModule {}

export { QuotaManagementService, QuotaService };
export { PrismaService } from '../../prisma';
export { Quota_FreePlanV1, Quota_ProPlanV1, Quotas } from './types';
