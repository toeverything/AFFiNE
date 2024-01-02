import { AFFiNEStorageConfig, Storages } from '../../../config/storage';
import { FsStorageProvider } from './fs';
import type { StorageProvider } from './provider';
import { R2StorageProvider } from './r2';
import { S3StorageProvider } from './s3';

export function createStorageProvider(
  config: AFFiNEStorageConfig,
  storage: Storages
): StorageProvider {
  const storageConfig = config.storages[storage];
  const providerConfig = config.providers[storageConfig.provider] as any;
  if (!providerConfig) {
    throw new Error(
      `Failed to create ${storageConfig.provider} storage, configuration not correctly set`
    );
  }

  if (storageConfig.provider === 's3') {
    return new S3StorageProvider(providerConfig, storageConfig.bucket);
  }

  if (storageConfig.provider === 'r2') {
    return new R2StorageProvider(providerConfig, storageConfig.bucket);
  }

  if (storageConfig.provider === 'fs') {
    return new FsStorageProvider(providerConfig, storageConfig.bucket);
  }

  throw new Error(`Unknown storage provider type: ${storageConfig.provider}`);
}

export type * from './provider';
