import { Injectable } from '@nestjs/common';

import {
  StorageProvider,
  StorageProviderConfig,
  StorageProviders,
} from './providers';

@Injectable()
export class StorageProviderFactory {
  create(config: StorageProviderConfig): StorageProvider {
    const Provider = StorageProviders[config.provider];

    if (!Provider) {
      throw new Error(`Unknown storage provider type: ${config.provider}`);
    }

    return new Provider(config.config, config.bucket);
  }
}
