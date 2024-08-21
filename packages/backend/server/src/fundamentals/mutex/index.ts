import { Global, Module } from '@nestjs/common';

import { Locker } from './local-lock';
import { Mutex, RequestMutex } from './mutex';

@Global()
@Module({
  providers: [Mutex, RequestMutex, Locker],
  exports: [Mutex, RequestMutex],
})
export class MutexModule {}

export { Locker, Mutex, RequestMutex };
export { type Locker as ILocker, Lock } from './lock';
