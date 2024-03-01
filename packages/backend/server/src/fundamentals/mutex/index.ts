import { randomUUID } from 'node:crypto';

import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { sleep } from '../utils/utils';

export const MUTEX_RETRY = 3;
export const MUTEX_WAIT = 100;

@Injectable()
export class MutexService {
  private readonly logger = new Logger(MutexService.name);
  private readonly bucket = new Map<string, string>();

  constructor(private readonly als: ClsService) {}

  private getId() {
    let id = this.als.get('asyncId');

    if (!id) {
      id = randomUUID();
      this.als.set('asyncId', id);
    }

    return id;
  }

  async lock(key: string): Promise<boolean> {
    const id = this.getId();
    const fetchLock = async (retry: number): Promise<boolean> => {
      if (retry === 0) {
        this.logger.error(
          `Failed to fetch lock ${key} after ${MUTEX_RETRY} retry`
        );
        return false;
      }
      const current = this.bucket.get(key);
      if (current && current !== id) {
        this.logger.warn(
          `Failed to fetch lock ${key}, retrying in ${MUTEX_WAIT} ms`
        );
        await sleep(MUTEX_WAIT * (MUTEX_RETRY - retry + 1));
        return fetchLock(retry - 1);
      }
      this.bucket.set(key, id);
      console.error('success lock', key);
      return true;
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
