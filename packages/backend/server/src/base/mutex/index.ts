import { Global, Module } from '@nestjs/common';

import { Locker, LockUnavailableError } from './locker';
import { Mutex, RequestMutex } from './mutex';

@Global()
@Module({
  providers: [Mutex, RequestMutex, Locker],
  exports: [Mutex, RequestMutex],
})
export class MutexModule {}

export { Locker, LockUnavailableError, Mutex, RequestMutex };
export { Lock } from './lock';
