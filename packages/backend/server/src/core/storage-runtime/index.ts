import { Global, Module } from '@nestjs/common';

import { StorageRuntimeProvider } from './provider';

@Global()
@Module({
  providers: [StorageRuntimeProvider],
  exports: [StorageRuntimeProvider],
})
export class StorageRuntimeModule {}

export {
  type StorageRuntimeGetObjectResult,
  StorageRuntimeProvider,
} from './provider';
