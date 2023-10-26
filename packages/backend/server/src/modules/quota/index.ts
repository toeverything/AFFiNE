import { Module } from '@nestjs/common';

import { PermissionService } from '../workspaces/permission';
import { FeatureService, Quotas, QuotaService, QuotaType } from './configure';
import { FeatureManagementService } from './feature';
import { QuotaManagementService } from './storage';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  providers: [
    PermissionService,
    FeatureService,
    QuotaService,
    FeatureManagementService,
    QuotaManagementService,
  ],
  exports: [
    FeatureService,
    FeatureManagementService,
    QuotaService,
    QuotaManagementService,
  ],
})
export class QuotaModule {}

export {
  FeatureManagementService,
  FeatureService,
  QuotaManagementService,
  Quotas,
  QuotaService,
  QuotaType,
};
export { FeatureVersion_FreePlanV1, FeatureVersion_ProPlanV1 } from './preload';
