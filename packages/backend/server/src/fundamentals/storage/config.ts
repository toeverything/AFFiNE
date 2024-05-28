import { homedir } from 'node:os';
import { join } from 'node:path';

import { defineStartupConfig, ModuleConfig } from '../config';

export interface FsStorageConfig {
  path: string;
}

export interface StorageProvidersConfig {
  fs?: FsStorageConfig;
}

declare module '../config' {
  interface AppConfig {
    storageProviders: ModuleConfig<StorageProvidersConfig>;
  }
}

defineStartupConfig('storageProviders', {
  fs: {
    path: join(homedir(), '.affine/storage'),
  },
});

export type StorageProviderType = keyof StorageProvidersConfig;

export type StorageConfig<Ext = unknown> = {
  provider: StorageProviderType;
  bucket: string;
} & Ext;

export interface StoragesConfig {
  avatar: StorageConfig<{ publicLinkFactory: (key: string) => string }>;
  blob: StorageConfig;
  copilot: StorageConfig;
}

export interface AFFiNEStorageConfig {
  /**
   * All providers for object storage
   *
   * Support different providers for different usage at the same time.
   */
  providers: StorageProvidersConfig;
  storages: StoragesConfig;
}

export type StorageProviders = AFFiNEStorageConfig['providers'];
export type Storages = keyof AFFiNEStorageConfig['storages'];

export function getDefaultAFFiNEStorageConfig(): AFFiNEStorageConfig {
  return {
    providers: {
      fs: {
        path: join(homedir(), '.affine/storage'),
      },
    },
    storages: {
      avatar: {
        provider: 'fs',
        bucket: 'avatars',
        publicLinkFactory: key => `/api/avatars/${key}`,
      },
      blob: {
        provider: 'fs',
        bucket: 'blobs',
      },
      copilot: {
        provider: 'fs',
        bucket: 'copilot',
      },
    },
  };
}
