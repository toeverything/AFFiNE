import serverNativeModule from '@affine/server-native';

import { defineNativeModuleConfig } from '../../base';

export enum SearchProviderType {
  Embedded = 'embedded',
  Elasticsearch = 'elasticsearch',
  ManticoreSearch = 'manticoresearch',
}

declare global {
  interface AppConfigSchema {
    indexer: {
      enabled: boolean;
      provider: {
        type: SearchProviderType;
        endpoint: string;
        apiKey: string;
        username: string;
        password: string;
      };
    };
  }
}

defineNativeModuleConfig(
  'indexer',
  serverNativeModule.appConfigDescriptors('indexer'),
  serverNativeModule.validateAppConfigValue
);
