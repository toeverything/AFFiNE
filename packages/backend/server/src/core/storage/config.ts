import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';
import { StorageProviderType } from '../../fundamentals/storage';

export type StorageConfig<Ext = unknown> = {
  provider: StorageProviderType;
  bucket: string;
} & Ext;

export interface StorageStartupConfigurations {
  avatar: StorageConfig<{
    publicLinkFactory: (key: string) => string;
    keyInPublicLink: (link: string) => string;
  }>;
  blob: StorageConfig;
}

declare module '../../fundamentals/config' {
  interface AppConfig {
    storages: ModuleConfig<StorageStartupConfigurations>;
  }
}

defineStartupConfig('storages', {
  avatar: {
    provider: 'fs',
    bucket: 'avatars',
    publicLinkFactory: key => `/api/avatars/${key}`,
    keyInPublicLink: link => link.split('/').pop() as string,
  },
  blob: {
    provider: 'fs',
    bucket: 'blobs',
  },
});
