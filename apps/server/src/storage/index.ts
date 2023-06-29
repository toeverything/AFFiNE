import { Storage } from '@affine/storage';
import { type DynamicModule, type FactoryProvider } from '@nestjs/common';

import { Config } from '../config';

export class StorageModule {
  static forRoot(): DynamicModule {
    const storageProvider: FactoryProvider = {
      provide: Storage,
      useFactory: async (config: Config) => {
        return Storage.connect(config.db.url);
      },
      inject: [Config],
    };

    return {
      global: true,
      module: StorageModule,
      providers: [storageProvider],
      exports: [storageProvider],
    };
  }
}
