import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { CONTEXT } from '@nestjs/graphql';

import type { GraphqlContext } from '../graphql';
import { BucketService } from './bucket';

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

export const MUTEX_RETRY = 5;
export const MUTEX_WAIT = 100;

@Injectable({ scope: Scope.REQUEST })
export class MutexService {
  protected logger = new Logger(MutexService.name);

  constructor(
    @Inject(CONTEXT) private readonly context: GraphqlContext,
    private readonly bucket: BucketService
  ) {}

  protected getId() {
    let id = this.context.req.headers['x-transaction-id'] as string;

    if (!id) {
      id = randomUUID();
      this.context.req.headers['x-transaction-id'] = id;
    }

    return id;
  }

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
