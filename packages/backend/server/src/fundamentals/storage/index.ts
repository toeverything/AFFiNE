import './config';

import { Global, Module } from '@nestjs/common';

import { registerStorageProvider, StorageProviderFactory } from './providers';
import { FsStorageProvider } from './providers/fs';

registerStorageProvider('fs', (config, bucket) => {
  if (!config.storageProviders.fs) {
    throw new Error('Missing fs storage provider configuration');
  }

  return new FsStorageProvider(config.storageProviders.fs, bucket);
});

@Global()
@Module({
  providers: [StorageProviderFactory],
  exports: [StorageProviderFactory],
})
export class StorageProviderModule {}

export * from '../../native';
export type { StorageProviderType } from './config';
export type {
  BlobInputType,
  BlobOutputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PutObjectMetadata,
  StorageProvider,
} from './providers';
export { registerStorageProvider, StorageProviderFactory } from './providers';
export { autoMetadata, toBuffer } from './providers/utils';
