import KeyvRedis from '@keyv/redis';
import { Global, Injectable, Module } from '@nestjs/common';
import Redis from 'ioredis';
import Keyv from 'keyv';

import { Config } from './config';

@Injectable()
export class Session {
  private readonly cache: Keyv;
  private readonly prefix = 'session:';
  private readonly sessionTtl = 30 * 60; // 30 min

  constructor(protected readonly config: Config) {
    if (config.redis.enabled) {
      this.cache = new Keyv({
        store: new KeyvRedis(new Redis(config.redis)),
      });
    } else {
      this.cache = new Keyv();
    }
  }

  /**
   * get session
   * @param key session key
   * @returns
   */
  async get(key: string) {
    return this.cache.get(this.prefix + key);
  }

  /**
   * set session
   * @param key session key
   * @param value session value
   * @param sessionTtl session ttl, default 30 min
   * @returns return true if success
   */
  async set(key: string, value?: any, sessionTtl = this.sessionTtl) {
    return this.cache.set(this.prefix + key, value, sessionTtl);
  }
}

@Global()
@Module({
  providers: [Session],
  exports: [Session],
})
export class SessionModule {}
