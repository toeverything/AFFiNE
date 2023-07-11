import { Global, Module } from '@nestjs/common';

import { Metrics } from './metrics';

@Global()
@Module({
  providers: [Metrics],
  exports: [Metrics],
})
export class MetricsModule {}
