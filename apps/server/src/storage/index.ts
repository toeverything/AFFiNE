import { createRequire } from 'node:module';

import type { Storage } from '@affine/storage';
import { type DynamicModule, type FactoryProvider } from '@nestjs/common';

import { Config } from '../config';

export const StorageProvide = Symbol('Storage');

const require = createRequire(import.meta.url);

export class StorageModule {
  static forRoot(): DynamicModule {
    const storageProvider: FactoryProvider = {
      provide: StorageProvide,
      useFactory: async (config: Config) => {
        let StorageFactory: typeof Storage;
        try {
          // dev mode
          StorageFactory = (await import('@affine/storage')).Storage;
        } catch {
          // In docker
          StorageFactory = require('../../storage.node').Storage;
        }
        return StorageFactory.connect(config.db.url);
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
