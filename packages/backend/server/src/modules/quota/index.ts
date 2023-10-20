import { Module } from '@nestjs/common';

import { PermissionService } from '../workspaces/permission';
import { FeatureService, QuotaService } from './configure';
import { StorageQuotaService } from './storage';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  providers: [
    FeatureService,
    QuotaService,
    PermissionService,
    StorageQuotaService,
  ],
  exports: [QuotaService, StorageQuotaService],
})
export class QuotaModule {}

export { QuotaService, StorageQuotaService };
