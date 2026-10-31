import './config';

import { Module } from '@nestjs/common';

import { MobileDebugLogController } from './controller';
import { MobileDebugLogService } from './service';

@Module({
  providers: [MobileDebugLogService],
  controllers: [MobileDebugLogController],
})
export class MobileDebugLogModule {}
