import { Global, Module, Provider, Type } from '@nestjs/common';
import { Redis } from 'ioredis';

import { SessionCache, ThrottlerCache } from './instances';
import { LocalCache } from './providers/cache';
import { RedisCache } from './providers/redis';
import { CacheRedis, SessionRedis, ThrottlerRedis } from './redis';

function makeCacheProvider(CacheToken: Type, RedisToken: Type): Provider {
  return {
    provide: CacheToken,
    useFactory: (redis?: Redis) => {
      return redis ? new RedisCache(redis) : new LocalCache();
    },
    inject: [{ token: RedisToken, optional: true }],
  };
}

const CacheProvider = makeCacheProvider(LocalCache, CacheRedis);
const SessionCacheProvider = makeCacheProvider(SessionCache, SessionRedis);
const ThrottlerCacheProvider = makeCacheProvider(
  ThrottlerCache,
  ThrottlerRedis
);

@Global()
@Module({
  providers: [CacheProvider, SessionCacheProvider, ThrottlerCacheProvider],
  exports: [CacheProvider, SessionCacheProvider, ThrottlerCacheProvider],
})
export class CacheModule {}
export { LocalCache as Cache, SessionCache, ThrottlerCache };

export { CacheInterceptor, MakeCache, PreventCache } from './interceptor';
