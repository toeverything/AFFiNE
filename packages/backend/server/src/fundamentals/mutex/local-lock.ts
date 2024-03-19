import { Injectable } from '@nestjs/common';

import { Cache } from '../cache';
import { Lock, Locker as ILocker } from './lock';

@Injectable()
export class Locker implements ILocker {
  constructor(private readonly cache: Cache) {}

  async lock(owner: string, key: string): Promise<Lock> {
    const lockKey = `MutexLock:${key}`;
    const prevOwner = await this.cache.get<string>(lockKey);

    if (prevOwner && prevOwner !== owner) {
      throw new Error(`Lock for resource [${key}] has been holder by others`);
    }

    const acquired = await this.cache.set(lockKey, owner);

    if (acquired) {
      return new Lock(async () => {
        await this.cache.delete(lockKey);
      });
    }

    throw new Error(`Failed to acquire lock for resource [${key}]`);
  }
}
