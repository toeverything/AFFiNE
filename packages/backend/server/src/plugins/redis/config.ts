import { RedisOptions } from 'ioredis';

import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

declare module '../config' {
  interface PluginsConfig {
    redis: ModuleConfig<RedisOptions>;
  }
}

defineStartupConfig('plugins.redis', {});
