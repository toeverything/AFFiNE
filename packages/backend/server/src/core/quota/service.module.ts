import { Module } from '@nestjs/common';

import { StorageModule } from '../storage';
import { QuotaService } from './service';

@Module({
  imports: [StorageModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaServiceModule {}
