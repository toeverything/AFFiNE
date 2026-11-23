import './config';

import { Global, Module } from '@nestjs/common';

import {
  OpentelemetryOptionsFactory,
  OpentelemetryProvider,
} from './opentelemetry';

@Global()
@Module({
  providers: [OpentelemetryOptionsFactory, OpentelemetryProvider],
  exports: [OpentelemetryOptionsFactory],
})
export class MetricsModule {}

export * from './metrics';
export * from './utils';
export { OpentelemetryOptionsFactory };
