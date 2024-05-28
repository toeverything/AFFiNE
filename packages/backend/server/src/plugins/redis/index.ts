import './config';

import { Global, Provider, Type } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

import { Cache, Locker, SessionCache } from '../../fundamentals';
import { ThrottlerStorage } from '../../fundamentals/throttler';
import { SocketIoAdapterImpl } from '../../fundamentals/websocket';
import { Plugin } from '../registry';
import { RedisCache } from './cache';
import { CacheRedis, SessionRedis, SocketIoRedis } from './instances';
import { RedisMutexLocker } from './mutex';
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
  inject: [SessionRedis],
};

// socket io
const socketIoRedisAdapterProvider: Provider = {
  provide: SocketIoAdapterImpl,
  useFactory: (redis: Redis) => {
    return createSockerIoAdapterImpl(redis);
  },
  inject: [SocketIoRedis],
};

// mutex
const mutexRedisAdapterProvider: Provider = {
  provide: Locker,
  useClass: RedisMutexLocker,
};

@Global()
@Plugin({
  name: 'redis',
  providers: [CacheRedis, SessionRedis, SocketIoRedis],
  overrides: [
    cacheProvider,
    sessionCacheProvider,
    socketIoRedisAdapterProvider,
    throttlerStorageProvider,
    mutexRedisAdapterProvider,
  ],
  requires: ['plugins.redis.host'],
})
export class RedisModule {}
