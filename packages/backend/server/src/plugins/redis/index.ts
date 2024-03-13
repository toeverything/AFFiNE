import { Global, Provider, Type } from '@nestjs/common';
import { CONTEXT } from '@nestjs/graphql';
import { Redis, type RedisOptions } from 'ioredis';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

import {
  BucketService,
  Cache,
  type GraphqlContext,
  MutexService,
  SessionCache,
} from '../../fundamentals';
import { ThrottlerStorage } from '../../fundamentals/throttler';
import { SocketIoAdapterImpl } from '../../fundamentals/websocket';
import { Plugin } from '../registry';
import { RedisCache } from './cache';
import {
  CacheRedis,
  MutexRedis,
  SessionRedis,
  SocketIoRedis,
  ThrottlerRedis,
} from './instances';
import { MutexRedisService } from './mutex';
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

// mutex
const mutexRedisAdapterProvider: Provider = {
  provide: MutexService,
  useFactory: (redis: Redis, ctx: GraphqlContext, bucket: BucketService) => {
    return new MutexRedisService(redis, ctx, bucket);
  },
  inject: [MutexRedis, CONTEXT, BucketService],
};

@Global()
@Plugin({
  name: 'redis',
  providers: [
    CacheRedis,
    SessionRedis,
    ThrottlerRedis,
    SocketIoRedis,
    MutexRedis,
  ],
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

export { RedisOptions };
