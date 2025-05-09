import './config';

import { Global, Module } from '@nestjs/common';

import {
  CacheRedis,
  QueueRedis,
  SessionRedis,
  SocketIoRedis,
} from './instances';

@Global()
@Module({
  providers: [CacheRedis, SessionRedis, SocketIoRedis, QueueRedis],
  exports: [CacheRedis, SessionRedis, SocketIoRedis, QueueRedis],
})
export class RedisModule {}

export { CacheRedis, QueueRedis, SessionRedis, SocketIoRedis };
