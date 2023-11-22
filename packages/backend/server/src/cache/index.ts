import { FactoryProvider, Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

import { Config } from '../config';
import { LocalCache } from './cache';
import { RedisCache } from './redis';

const CacheProvider: FactoryProvider = {
  provide: LocalCache,
  useFactory: (config: Config) => {
    return config.redis.enabled
      ? new RedisCache(new Redis(config.redis))
      : new LocalCache();
  },
  inject: [Config],
};

@Global()
@Module({
  providers: [CacheProvider],
  exports: [CacheProvider],
})
export class CacheModule {}
export { LocalCache as Cache };
