import { Global, Module } from '@nestjs/common';

import { Cache, SessionCache } from './instances';

@Global()
@Module({
  providers: [Cache, SessionCache],
  exports: [Cache, SessionCache],
})
export class CacheModule {}
export { Cache, SessionCache };

export { CacheInterceptor, MakeCache, PreventCache } from './interceptor';
