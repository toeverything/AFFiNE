import { Global, Module } from '@nestjs/common';

import { GlobalCacheStorage, GlobalStateStorage } from './storage.service';

@Global()
@Module({
  providers: [GlobalStateStorage, GlobalCacheStorage],
  exports: [GlobalStateStorage, GlobalCacheStorage],
})
export class StorageModule {}
