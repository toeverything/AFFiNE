import { Module } from '@nestjs/common';

import { QuotaManagementService } from './management';
import { QuotaUsageService } from './usage';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  imports: [QuotaUsageService, QuotaManagementService],
})
export class QuotaModule {}
