import { Module } from '@nestjs/common';

import { PermissionService } from '../workspaces/permission';
import { FeatureService } from './feature';
import { QuotaService } from './quota';
import { StorageQuotaService } from './services';

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
