import { Global, Injectable, Module } from '@nestjs/common';

import { SessionCache } from './cache/instances';

@Injectable()
export class SessionService {
  private readonly prefix = 'session:';
  private readonly sessionTtl = 30 * 60 * 1000; // 30 min

  constructor(private readonly cache: SessionCache) {}

  /**
   * get session
   * @param key session key
   * @returns
   */
  async get(key: string) {
    return this.cache.get<string>(this.prefix + key);
  }

  /**
   * set session
   * @param key session key
   * @param value session value
   * @param sessionTtl session ttl (ms), default 30 min
   * @returns return true if success
   */
  async set(key: string, value?: any, sessionTtl = this.sessionTtl) {
    return this.cache.set<string>(this.prefix + key, value, {
      ttl: sessionTtl,
    });
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
