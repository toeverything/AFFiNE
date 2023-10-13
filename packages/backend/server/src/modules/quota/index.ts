import { Module } from '@nestjs/common';

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
  imports: [FeatureService, QuotaService, StorageQuotaService],
})
export class QuotaModule {}

export { StorageQuotaService } from './services';
