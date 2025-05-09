import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { QuotaResolver } from './resolver';
import { QuotaService } from './service';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  imports: [StorageModule, PermissionModule],
  providers: [QuotaService, QuotaResolver],
  exports: [QuotaService],
})
export class QuotaModule {}

export { QuotaService };
export { WorkspaceQuotaHumanReadableType, WorkspaceQuotaType } from './types';
