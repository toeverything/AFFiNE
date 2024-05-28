import { S3ClientConfig, S3ClientConfigType } from '@aws-sdk/client-s3';

import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

type WARNING = '__YOU_SHOULD_NOT_MANUALLY_CONFIGURATE_THIS_TYPE__';
declare module '../../fundamentals/storage/config' {
  interface StorageProvidersConfig {
    // the type here is only existing for extends [StorageProviderType] with better type inference and checking.
    'cloudflare-r2'?: WARNING;
    'aws-s3'?: WARNING;
  }
}

export type S3StorageConfig = S3ClientConfigType;
export type R2StorageConfig = S3ClientConfigType & {
  accountId?: string;
};

declare module '../config' {
  interface PluginsConfig {
    'aws-s3': ModuleConfig<S3ClientConfig>;
    'cloudflare-r2': ModuleConfig<R2StorageConfig>;
  }
}

defineStartupConfig('plugins.aws-s3', {});
defineStartupConfig('plugins.cloudflare-r2', {});
