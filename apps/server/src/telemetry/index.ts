import { Module } from '@nestjs/common';

import { TelemetryController } from './controller';

@Module({
  controllers: [TelemetryController],
})
export class TelemetryModule {}
