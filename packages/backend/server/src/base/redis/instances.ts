import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis as IORedis, RedisOptions } from 'ioredis';

import { Config } from '../config';

class Redis extends IORedis implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(this.constructor.name);

  errorHandler = (err: Error) => {
    this.logger.error(err);
  };

  onModuleInit() {
    this.on('error', this.errorHandler);
  }

  async onModuleDestroy() {
    try {
      await this.quit();
    } catch {
      this.disconnect();
    }
  }

  override duplicate(override?: Partial<RedisOptions>): IORedis {
    const client = super.duplicate(override);
    client.on('error', this.errorHandler);
    return client;
  }

  assertValidDBIndex(db: number) {
    if (db && db > 15) {
      throw new Error(
        // Redis allows [0..16) by default
        // we separate the db for different usages by `this.options.db + [0..4]`
        `Invalid database index: ${db}, must be between 0 and 11`
      );
    }
  }
}

@Injectable()
export class CacheRedis extends Redis {
  constructor(config: Config) {
    super({ ...config.redis, ...config.redis.ioredis });
  }
}

@Injectable()
export class SessionRedis extends Redis {
  constructor(config: Config) {
    super({
      ...config.redis,
      ...config.redis.ioredis,
      db: (config.redis.db ?? 0) + 2,
    });
  }
}

@Injectable()
export class SocketIoRedis extends Redis {
  constructor(config: Config) {
    super({
      ...config.redis,
      ...config.redis.ioredis,
      db: (config.redis.db ?? 0) + 3,
    });
  }
}

@Injectable()
export class QueueRedis extends Redis {
  constructor(config: Config) {
    super({
      ...config.redis,
      ...config.redis.ioredis,
      db: (config.redis.db ?? 0) + 4,
      // required explicitly set to `null` by bullmq
      maxRetriesPerRequest: null,
    });
  }
}
