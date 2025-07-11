import { Global, Module } from '@nestjs/common';

import { MonitorService } from './service';

@Global()
@Module({
  providers: [MonitorService],
})
export class MonitorModule {}
