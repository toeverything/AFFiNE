import { Global, Module } from '@nestjs/common';

import { MetricsController } from '../metrics/controller';
import { Metrics } from './metrics';

@Global()
@Module({
  providers: [Metrics],
  exports: [Metrics],
  controllers: [MetricsController],
})
export class MetricsModule {}
