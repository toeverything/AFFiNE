import './config';

import {
  Global,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Provider,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { Config } from '../config';
import {
  LocalOpentelemetryFactory,
  OpentelemetryFactory,
  registerCustomMetrics,
} from './opentelemetry';

const factorProvider: Provider = {
  provide: OpentelemetryFactory,
  useFactory: (config: Config) => {
    return config.metrics.enabled ? new LocalOpentelemetryFactory() : null;
  },
  inject: [Config],
};

@Global()
@Module({
  providers: [factorProvider],
  exports: [factorProvider],
})
export class MetricsModule implements OnModuleInit, OnModuleDestroy {
  private sdk: NodeSDK | null = null;
  constructor(private readonly ref: ModuleRef) {}

  onModuleInit() {
    const factor = this.ref.get(OpentelemetryFactory, { strict: false });
    if (factor) {
      this.sdk = factor.create();
      this.sdk.start();
      registerCustomMetrics();
    }
  }

  async onModuleDestroy() {
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }
}

export * from './metrics';
export * from './utils';
export { OpentelemetryFactory };
