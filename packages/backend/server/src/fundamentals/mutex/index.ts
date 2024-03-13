import { Global, Module } from '@nestjs/common';

import { BucketService } from './bucket';
import { MutexService } from './mutex';

@Global()
@Module({
  providers: [BucketService, MutexService],
  exports: [BucketService, MutexService],
})
export class MutexModule {}

export { BucketService, MutexService };
export { LockGuard, MUTEX_RETRY, MUTEX_WAIT } from './mutex';
