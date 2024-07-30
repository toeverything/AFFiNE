import './config';

import { Module } from '@nestjs/common';

import {
  ServerConfigResolver,
  ServerRuntimeConfigResolver,
  ServerServiceConfigResolver,
} from './resolver';

@Module({
  providers: [
    ServerConfigResolver,
    ServerRuntimeConfigResolver,
    ServerServiceConfigResolver,
  ],
})
export class ServerConfigModule {}
export { ADD_ENABLED_FEATURES, ServerConfigType } from './resolver';
export { ServerFeature } from './types';
