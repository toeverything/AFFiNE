import { S3ClientConfigType } from '@aws-sdk/client-s3';

type WARNING = '__YOU_SHOULD_NOT_MANUALLY_CONFIGURATE_THIS_TYPE__';
export type R2StorageConfig = S3ClientConfigType & {
  accountId: string;
};

export type S3StorageConfig = S3ClientConfigType;

declare module '../../fundamentals/config/storage' {
  interface StorageProvidersConfig {
    // the type here is only existing for extends [StorageProviderType] with better type inference and checking.
    'cloudflare-r2'?: WARNING;
    'aws-s3'?: WARNING;
  }
}
