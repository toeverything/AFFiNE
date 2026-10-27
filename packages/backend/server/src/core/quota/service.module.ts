import { Module } from '@nestjs/common';

import { QuotaStateRealtimeProvider } from './realtime';
import { QuotaService } from './service';

@Module({
  providers: [QuotaService, QuotaStateRealtimeProvider],
  exports: [QuotaService],
})
export class QuotaServiceModule {}
