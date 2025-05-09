import { Global, Module } from '@nestjs/common';

import { StorageProviderFactory } from './factory';

@Global()
@Module({
  providers: [StorageProviderFactory],
  exports: [StorageProviderFactory],
})
export class StorageProviderModule {}
export { StorageProviderFactory } from './factory';
export * from './providers';
