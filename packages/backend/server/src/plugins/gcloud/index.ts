import { Global, Module } from '@nestjs/common';

import { GCloudLogging } from './logging';
import { GCloudMetrics } from './metrics';

@Global()
@Module({
  imports: [GCloudMetrics, GCloudLogging],
})
export class GCloudModule {}
