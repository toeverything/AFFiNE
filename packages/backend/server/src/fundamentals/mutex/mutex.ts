import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CONTEXT } from '@nestjs/graphql';

import type { GraphqlContext } from '../graphql';
import { retryable } from '../utils/promise';
import { Locker } from './local-lock';

export const MUTEX_RETRY = 5;
export const MUTEX_WAIT = 100;

@Injectable({ scope: Scope.REQUEST })
export class MutexService {
  protected logger = new Logger(MutexService.name);

  constructor(
    @Inject(CONTEXT) private readonly context: GraphqlContext,
    private readonly ref: ModuleRef
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
  async lock(key: string) {
    try {
      return await retryable(
        () => {
          const locker = this.ref.get(Locker, { strict: false });
          return locker.lock(this.getId(), key);
        },
        MUTEX_RETRY,
        MUTEX_WAIT
      );
    } catch (e) {
      this.logger.error(
        `Failed to lock resource [${key}] after retry ${MUTEX_RETRY} times`,
        e
      );
      return undefined;
    }
  }
}
