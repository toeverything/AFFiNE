import './config';

import { Module } from '@nestjs/common';

import {
  ServerConfigResolver,
  ServerFeatureConfigResolver,
  ServerRuntimeConfigResolver,
  ServerServiceConfigResolver,
} from './resolver';

@Module({
  providers: [
    ServerConfigResolver,
    ServerFeatureConfigResolver,
    ServerRuntimeConfigResolver,
    ServerServiceConfigResolver,
  ],
})
export class ServerConfigModule {}
export { ADD_ENABLED_FEATURES } from './server-feature';
export { ServerFeature } from './types';
