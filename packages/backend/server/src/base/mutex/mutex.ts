import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { ModuleRef, REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { nanoid } from 'nanoid';

import { GraphqlContext } from '../graphql';
import { retryable } from '../utils/promise';
import { Locker } from './locker';

export const MUTEX_RETRY = 5;
export const MUTEX_WAIT = 100;

@Injectable()
export class Mutex {
  protected logger = new Logger(Mutex.name);
  private readonly clusterIdentifier = `cluster:${nanoid()}`;

  constructor(protected readonly locker: Locker) {}

  /**
   * Attempt to lock a resource once, without the retries used by {@link acquire}.
   *
   * This is intended for best-effort work that must not delay the caller when
   * another request already owns the lock.
   */
  async tryAcquire(
    key: string,
    owner: string = `${this.clusterIdentifier}:${nanoid()}`
  ) {
    try {
      return await this.locker.lock(owner, key);
    } catch {
      return undefined;
    }
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
   *   await using lock = await mutex.acquire('resource-key');
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
  async acquire(
    key: string,
    owner: string = `${this.clusterIdentifier}:${nanoid()}`
  ) {
    try {
      return await retryable(
        () => this.locker.lock(owner, key),
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

@Injectable({ scope: Scope.REQUEST })
export class RequestMutex extends Mutex {
  constructor(
    @Inject(REQUEST) private readonly request: Request | GraphqlContext,
    ref: ModuleRef
  ) {
    // nestjs will always find and injecting the locker from local module
    // so the RedisLocker implemented by the plugin mechanism will not be able to overwrite the internal locker
    // we need to use find and get the locker from the `ModuleRef` manually
    //
    // NOTE: when a `constructor` execute in normal service, the Locker module we expect may not have been initialized
    //       but in the Service with `Scope.REQUEST`, we will create a separate Service instance for each request
    //       at this time, all modules have been initialized, so we able to get the correct Locker instance in `constructor`
    super(ref.get(Locker));
  }

  protected getId() {
    const req = 'req' in this.request ? this.request.req : this.request;
    let id = req.headers['x-transaction-id'] as string;

    if (!id) {
      id = randomUUID();
      req.headers['x-transaction-id'] = id;
    }

    return id;
  }

  override acquire(key: string) {
    return super.acquire(key, this.getId());
  }
}
