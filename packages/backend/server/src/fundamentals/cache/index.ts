import { Global, Module } from '@nestjs/common';

import { Cache, SessionCache } from './instances';
import { CacheInterceptor } from './interceptor';

@Global()
@Module({
  providers: [Cache, SessionCache, CacheInterceptor],
  exports: [Cache, SessionCache, CacheInterceptor],
})
export class CacheModule {}
export { Cache, SessionCache };

export { CacheInterceptor, MakeCache, PreventCache } from './interceptor';
