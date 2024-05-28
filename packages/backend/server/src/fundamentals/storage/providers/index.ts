import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { StorageConfig, StorageProviderType } from '../config';
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

  create(storage: StorageConfig): StorageProvider {
    const providerFactory = availableProviders.get(storage.provider);

    if (!providerFactory) {
      throw new Error(`Unknown storage provider type: ${storage.provider}`);
    }

    return providerFactory(this.config, storage.bucket);
  }
}

export type * from './provider';
