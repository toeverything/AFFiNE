import { homedir } from 'node:os';
import { join } from 'node:path';

import { S3ClientConfigType } from '@aws-sdk/client-s3';

export type StorageProviderType = 'fs' | 'r2' | 's3';
export interface FsStorageConfig {
  path: string;
}
export type R2StorageConfig = S3ClientConfigType & {
  accountId: string;
};
export type S3StorageConfig = S3ClientConfigType;

export type StorageTargetConfig<Ext = unknown> = {
  provider: StorageProviderType;
  bucket: string;
} & Ext;

export interface AFFiNEStorageConfig {
  /**
   * All providers for object storage
   *
   * Support different providers for different usage at the same time.
   */
  providers: {
    fs?: FsStorageConfig;
    s3?: S3StorageConfig;
    r2?: R2StorageConfig;
  };
  storages: {
    avatar: StorageTargetConfig<{ publicLinkFactory: (key: string) => string }>;
    blob: StorageTargetConfig;
  };
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
    },
  };
}
