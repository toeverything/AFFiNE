import { Module } from '@nestjs/common';

import { FeatureService } from './feature';
import { QuotaService } from './quota';

/**
 * Quota module provider pre-user quota management.
 * includes:
 * - quota query/update/permit
 * - quota statistics
 */
@Module({
  imports: [FeatureService, QuotaService],
})
export class QuotaModule {}
