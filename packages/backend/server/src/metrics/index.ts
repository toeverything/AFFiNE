import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { Config } from '../config';
import { parseEnvValue } from '../config/def';
import { createSDK, registerCustomMetrics } from './opentelemetry';

@Global()
@Module({})
export class MetricsModule implements OnModuleInit, OnModuleDestroy {
  private sdk: NodeSDK | null = null;
  constructor(private readonly config: Config) {}

  onModuleInit() {
    if (
      this.config.metrics.enabled &&
      !parseEnvValue(process.env.DISABLE_TELEMETRY, 'boolean')
    ) {
      this.sdk = createSDK();
      this.sdk.start();
      registerCustomMetrics();
    }
  }

  async onModuleDestroy() {
    if (this.config.metrics.enabled && this.sdk) {
      await this.sdk.shutdown();
    }
  }
}

export * from './metrics';
export * from './utils';
