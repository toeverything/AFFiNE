import serverNativeModule from '@affine/server-native';

import { defineNativeModuleConfig, StorageProviderConfig } from '../../base';

export interface Storages {
  avatar: {
    storage: ConfigItem<StorageProviderConfig>;
    publicPath: string;
  };
  blob: {
    storage: ConfigItem<StorageProviderConfig>;
  };
}

declare global {
  interface AppConfigSchema {
    storages: Storages;
  }
}

defineNativeModuleConfig(
  'storages',
  serverNativeModule.appConfigDescriptors('storages'),
  serverNativeModule.validateAppConfigValue,
  {
    'avatar.publicPath': {
      desc: 'The public accessible path prefix for user avatars.',
      default: '/api/avatars/',
    },
  }
);
