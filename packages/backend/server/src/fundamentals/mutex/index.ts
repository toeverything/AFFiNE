import { Global, Module } from '@nestjs/common';

import { Locker } from './local-lock';
import { MutexService } from './mutex';

@Global()
@Module({
  providers: [MutexService, Locker],
  exports: [MutexService],
})
export class MutexModule {}

export { Locker, MutexService };
export { type Locker as ILocker, Lock } from './lock';
