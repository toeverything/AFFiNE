import './config';

import { Module } from '@nestjs/common';

import {
  AppConfigResolver,
  ServerConfigResolver,
  ServerFeatureConfigResolver,
} from './resolver';
import { ServerService } from './service';

@Module({
  providers: [ServerService],
  exports: [ServerService],
})
export class ServerConfigModule {}
@Module({
  imports: [ServerConfigModule],
  providers: [
    ServerConfigResolver,
    ServerFeatureConfigResolver,
    AppConfigResolver,
  ],
})
export class ServerConfigResolverModule {}
export { ServerService };
export { ServerFeature } from './types';
