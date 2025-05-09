import { DynamicModule, Global, Module, Provider } from '@nestjs/common';

import { Config } from './config';
import { ConfigFactory, OVERRIDE_CONFIG_TOKEN } from './factory';
import { ConfigProvider } from './provider';

@Global()
@Module({
  providers: [ConfigProvider, ConfigFactory],
  exports: [ConfigProvider, ConfigFactory],
})
export class ConfigModule {
  static override(overrides: DeepPartial<AppConfigSchema> = {}): DynamicModule {
    const provider: Provider = {
      provide: OVERRIDE_CONFIG_TOKEN,
      useValue: overrides,
    };

    return {
      global: true,
      module: class ConfigOverrideModule {},
      providers: [provider],
      exports: [provider],
    };
  }
}

export { Config, ConfigFactory };
export { defineModuleConfig, type JSONSchema } from './register';
