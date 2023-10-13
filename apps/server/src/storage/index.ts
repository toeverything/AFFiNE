import { createRequire } from 'node:module';

import { type DynamicModule, type FactoryProvider } from '@nestjs/common';

import { Config } from '../config';

export const StorageProvide = Symbol('Storage');

let storageModule: typeof import('@affine/storage');
try {
  storageModule = await import('@affine/storage');
} catch {
  const require = createRequire(import.meta.url);
  storageModule = require('../../storage.node');
}

export class StorageModule {
  static forRoot(): DynamicModule {
    const storageProvider: FactoryProvider = {
      provide: StorageProvide,
      useFactory: async (config: Config) => {
        return storageModule.Storage.connect(config.db.url);
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

export const mergeUpdatesInApplyWay = storageModule.mergeUpdatesInApplyWay;

export const verifyChallengeResponse = async (
  response: any,
  resource: string
) => {
  if (typeof response !== 'string' || !response || !resource) return false;
  // 20 bits challenge is a balance between security and user experience
  // 20 bits challenge cost time is about 1-3s on m2 macbook air
  return storageModule.verifyChallengeResponse(response, 20, resource);
};
