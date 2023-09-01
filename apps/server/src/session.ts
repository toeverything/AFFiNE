import KeyvRedis from '@keyv/redis';
import { Global, Injectable, Module } from '@nestjs/common';
import Redis from 'ioredis';
import Keyv from 'keyv';

import { Config } from './config';

@Injectable()
export class SessionService {
  private readonly cache: Keyv;
  private readonly prefix = 'session:';
  private readonly sessionTtl = 30 * 60 * 1000; // 30 min

  constructor(protected readonly config: Config) {
    if (config.redis.enabled) {
      this.cache = new Keyv({
        store: new KeyvRedis(
          new Redis(config.redis.port, config.redis.host, {
            username: config.redis.username,
            password: config.redis.password,
            db: config.redis.database + 2,
          })
        ),
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
   * @param sessionTtl session ttl (ms), default 30 min
   * @returns return true if success
   */
  async set(key: string, value?: any, sessionTtl = this.sessionTtl) {
    return this.cache.set(this.prefix + key, value, sessionTtl);
  }

  async delete(key: string) {
    return this.cache.delete(this.prefix + key);
  }
}

@Global()
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
