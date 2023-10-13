// eslint-disable-next-line simple-import-sort/imports
import type { DynamicModule, FactoryProvider } from '@nestjs/common';
import { merge } from 'lodash-es';

import type { DeepPartial } from '../utils/types';
import type { AFFiNEConfig } from './def';

import '../prelude';

type ConstructorOf<T> = {
  new (): T;
};

function ApplyType<T>(): ConstructorOf<T> {
  // @ts-expect-error used to fake the type of config
  return class Inner implements T {
    constructor() {}
  };
}

/**
 * usage:
 * ```
 * import { Config } from '@affine/server'
 *
 * class TestConfig {
 *   constructor(private readonly config: Config) {}
 *   test() {
 *     return this.config.env
 *   }
 * }
 * ```
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

export type { AFFiNEConfig } from './def';
