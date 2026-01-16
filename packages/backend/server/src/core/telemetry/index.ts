import './config';

import { Module } from '@nestjs/common';

import { TelemetryController } from './controller';
import { TelemetryGateway } from './gateway';
import { TelemetryService } from './service';

@Module({
  providers: [TelemetryService, TelemetryGateway],
  controllers: [TelemetryController],
})
export class TelemetryModule {}
