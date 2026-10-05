import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis as IORedis, RedisOptions } from 'ioredis';
import { omit } from 'lodash-es';

import { ServerConfigHandle } from '../../native';

function redisOptions(options: RedisOptions) {
  return {
    ...(env.testing ? { lazyConnect: true } : {}),
    ...options,
  };
}

function redisConnection(
  handle: ServerConfigHandle,
  dbOffset: number
): [string, RedisOptions] {
  const url = new URL(handle.redisUrl() ?? 'redis://localhost:6379/0');
  const db = Number(url.pathname.slice(1) || 0) + dbOffset;
  url.pathname = `/${db}`;
  const options = omit(
    JSON.parse(handle.redisNodeOptionsJson()) as RedisOptions,
    ['host', 'port', 'db', 'username', 'password']
  );
  return [url.toString(), redisOptions(options)];
}

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
  constructor(handle: ServerConfigHandle) {
    super(...redisConnection(handle, 0));
  }
}

@Injectable()
export class SessionRedis extends Redis {
  constructor(handle: ServerConfigHandle) {
    super(...redisConnection(handle, 2));
  }
}

@Injectable()
export class SocketIoRedis extends Redis {
  constructor(handle: ServerConfigHandle) {
    super(...redisConnection(handle, 3));
  }
}
