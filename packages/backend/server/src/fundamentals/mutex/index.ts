import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

export const MUTEX_RETRY = 3;
export const MUTEX_WAIT = 100;

export class LockGuard<M extends MutexService = MutexService>
  implements AsyncDisposable
{
  constructor(
    private readonly mutex: M,
    private readonly key: string
  ) {}

  async [Symbol.asyncDispose]() {
    return this.mutex.unlock(this.key);
  }
}

@Injectable()
export class MutexService {
  protected logger = new Logger(MutexService.name);
  private readonly bucket = new Map<string, string>();

  constructor(protected readonly cls: ClsService) {}

  protected getId() {
    let id = this.cls.get('asyncId');

    if (!id) {
      id = randomUUID();
      this.cls.set('asyncId', id);
    }

    return id;
  }

  ///
  ///
  /**
   * lock an resource and return a lock guard, which will release the lock when disposed
   *
   * if the lock is not available, it will retry for [MUTEX_RETRY] times
   *
   * usage:
   * ```typescript
   * {
   *   // lock is acquired here
   *   await using lock = await mutex.lock('resource-key');
   *   if (lock) {
   *     // do something
   *   } else {
   *     // failed to lock
   *   }
   * }
   * // lock is released here
   * ```
   * @param key resource key
   * @returns LockGuard
   */
  async lock(key: string): Promise<LockGuard | undefined> {
    const id = this.getId();
    const fetchLock = async (retry: number): Promise<LockGuard | undefined> => {
      if (retry === 0) {
        this.logger.error(
          `Failed to fetch lock ${key} after ${MUTEX_RETRY} retry`
        );
        return undefined;
      }
      const current = this.bucket.get(key);
      if (current && current !== id) {
        this.logger.warn(
          `Failed to fetch lock ${key}, retrying in ${MUTEX_WAIT} ms`
        );
        await setTimeout(MUTEX_WAIT * (MUTEX_RETRY - retry + 1));
        return fetchLock(retry - 1);
      }
      this.bucket.set(key, id);
      return new LockGuard(this, key);
    };

    return fetchLock(MUTEX_RETRY);
  }

  async unlock(key: string): Promise<void> {
    if (this.bucket.get(key) === this.getId()) {
      this.bucket.delete(key);
    }
  }
}

@Global()
@Module({
  providers: [MutexService],
  exports: [MutexService],
})
export class MutexModule {}
