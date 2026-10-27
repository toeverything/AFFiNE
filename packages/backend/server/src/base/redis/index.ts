import './config';

import { Global, Module } from '@nestjs/common';

import { CacheRedis, SessionRedis, SocketIoRedis } from './instances';

@Global()
@Module({
  providers: [CacheRedis, SessionRedis, SocketIoRedis],
  exports: [CacheRedis, SessionRedis, SocketIoRedis],
})
export class RedisModule {}

export { CacheRedis, SessionRedis, SocketIoRedis };
