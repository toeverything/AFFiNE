import { Global, Provider, Type } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

import { Cache, SessionCache } from '../../fundamentals';
import { ThrottlerStorage } from '../../fundamentals/throttler';
import { SocketIoAdapterImpl } from '../../fundamentals/websocket';
import { Plugin } from '../registry';
import { RedisCache } from './cache';
import {
  CacheRedis,
  SessionRedis,
  SocketIoRedis,
  ThrottlerRedis,
} from './instances';
import { createSockerIoAdapterImpl } from './ws-adapter';

function makeProvider(token: Type, impl: Type<Redis>): Provider {
  return {
    provide: token,
    useFactory: (redis: Redis) => {
      return new RedisCache(redis);
    },
    inject: [impl],
  };
}

// cache
const cacheProvider = makeProvider(Cache, CacheRedis);
const sessionCacheProvider = makeProvider(SessionCache, SessionRedis);

// throttler
const throttlerStorageProvider: Provider = {
  provide: ThrottlerStorage,
  useFactory: (redis: Redis) => {
    return new ThrottlerStorageRedisService(redis);
  },
  inject: [ThrottlerRedis],
};

// socket io
const socketIoRedisAdapterProvider: Provider = {
  provide: SocketIoAdapterImpl,
  useFactory: (redis: Redis) => {
    return createSockerIoAdapterImpl(redis);
  },
  inject: [SocketIoRedis],
};

@Global()
@Plugin({
  name: 'redis',
  providers: [CacheRedis, SessionRedis, ThrottlerRedis, SocketIoRedis],
  overrides: [
    cacheProvider,
    sessionCacheProvider,
    socketIoRedisAdapterProvider,
    throttlerStorageProvider,
  ],
  requires: ['plugins.redis.host'],
})
export class RedisModule {}

export { RedisOptions };
