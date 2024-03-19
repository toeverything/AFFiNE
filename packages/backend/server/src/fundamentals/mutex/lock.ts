import { Logger } from '@nestjs/common';

import { retryable } from '../utils/promise';

export class Lock implements AsyncDisposable {
  private readonly logger = new Logger(Lock.name);

  constructor(private readonly dispose: () => Promise<void>) {}

  async release() {
    await retryable(() => this.dispose()).catch(e => {
      this.logger.error('Failed to release lock', e);
    });
  }

  async [Symbol.asyncDispose]() {
    await this.release();
  }
}

export interface Locker {
  lock(owner: string, key: string): Promise<Lock>;
}
