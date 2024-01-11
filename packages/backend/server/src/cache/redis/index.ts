import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis as IORedis } from 'ioredis';

import { Config } from '../../config';

class Redis extends IORedis implements OnModuleDestroy {
  onModuleDestroy() {
    this.disconnect();
  }
}

@Injectable()
export class CacheRedis extends Redis {
  constructor(config: Config) {
    super({ ...config.redis, db: config.redis.database });
  }
}

@Injectable()
export class ThrottlerRedis extends Redis {
  constructor(config: Config) {
    super({ ...config.redis, db: config.redis.database + 1 });
  }
}

@Injectable()
export class SessionRedis extends Redis {
  constructor(config: Config) {
    super({ ...config.redis, db: config.redis.database + 2 });
  }
}

@Global()
@Module({
  providers: [CacheRedis, ThrottlerRedis, SessionRedis],
  exports: [CacheRedis, ThrottlerRedis, SessionRedis],
})
export class RedisModule {}
