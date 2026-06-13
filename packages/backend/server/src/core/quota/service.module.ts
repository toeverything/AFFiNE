import { Module } from '@nestjs/common';

import { EntitlementModule } from '../entitlement';
import { StorageModule } from '../storage';
import { QuotaStateRealtimeProvider } from './realtime';
import { QuotaService } from './service';
import { QuotaStateService } from './state';

@Module({
  imports: [StorageModule, EntitlementModule],
  providers: [QuotaService, QuotaStateService, QuotaStateRealtimeProvider],
  exports: [QuotaService, QuotaStateService],
})
export class QuotaServiceModule {}
