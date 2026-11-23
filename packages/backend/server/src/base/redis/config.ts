import serverNativeModule from '@affine/server-native';
import { RedisOptions } from 'ioredis';

import { defineNativeModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    redis: {
      host: string;
      port: number;
      db: number;
      username: string;
      password: string;
      ioredis: ConfigItem<
        Omit<RedisOptions, 'host' | 'port' | 'db' | 'username' | 'password'>
      >;
    };
  }
}

defineNativeModuleConfig(
  'redis',
  serverNativeModule.appConfigDescriptors('redis'),
  serverNativeModule.validateAppConfigValue,
  {
    ioredis: {
      desc: 'The config for the ioredis client.',
      default: {},
      link: 'https://github.com/luin/ioredis',
    },
  }
);
