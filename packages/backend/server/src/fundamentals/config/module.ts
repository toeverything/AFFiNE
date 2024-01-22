import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { merge } from 'lodash-es';

import { ApplyType } from '../utils/types';
import { AFFiNEConfig } from './def';

/**
 * @example
 *
 * import { Config } from '@affine/server'
 *
 * class TestConfig {
 *   constructor(private readonly config: Config) {}
 *   test() {
 *     return this.config.env
 *   }
 * }
 */
export class Config extends ApplyType<AFFiNEConfig>() {}

function createConfigProvider(
  override?: DeepPartial<Config>
): FactoryProvider<Config> {
  return {
    provide: Config,
    useFactory: () => {
      const wrapper = new Config();
      const config = merge({}, globalThis.AFFiNE, override);

      const proxy: Config = new Proxy(wrapper, {
        get: (_target, property: keyof Config) => {
          const desc = Object.getOwnPropertyDescriptor(
            globalThis.AFFiNE,
            property
          );
          if (desc?.get) {
            return desc.get.call(proxy);
          }
          return config[property];
        },
      });
      return proxy;
    },
  };
}

export class ConfigModule {
  static forRoot = (override?: DeepPartial<Config>): DynamicModule => {
    const provider = createConfigProvider(override);

    return {
      global: true,
      module: ConfigModule,
      providers: [provider],
      exports: [provider],
    };
  };
}
