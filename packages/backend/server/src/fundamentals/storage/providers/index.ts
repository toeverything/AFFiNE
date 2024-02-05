import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import type { StorageProviderType, Storages } from '../../config/storage';
import type { StorageProvider } from './provider';

const availableProviders = new Map<
  StorageProviderType,
  (config: Config, bucket: string) => StorageProvider
>();

export function registerStorageProvider(
  type: StorageProviderType,
  providerFactory: (config: Config, bucket: string) => StorageProvider
) {
  availableProviders.set(type, providerFactory);
}

@Injectable()
export class StorageProviderFactory {
  constructor(private readonly config: Config) {}

  create(storage: Storages): StorageProvider {
    const storageConfig = this.config.storage.storages[storage];
    const providerFactory = availableProviders.get(storageConfig.provider);

    if (!providerFactory) {
      throw new Error(
        `Unknown storage provider type: ${storageConfig.provider}`
      );
    }

    return providerFactory(this.config, storageConfig.bucket);
  }
}

export type * from './provider';
