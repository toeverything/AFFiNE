import { registerStorageProvider } from '../../fundamentals/storage';
import { Plugin } from '../registry';
import { R2StorageProvider } from './providers/r2';
import { S3StorageProvider } from './providers/s3';

registerStorageProvider('cloudflare-r2', (config, bucket) => {
  if (!config.plugins['cloudflare-r2']) {
    throw new Error('Missing cloudflare-r2 storage provider configuration');
  }

  return new R2StorageProvider(config.plugins['cloudflare-r2'], bucket);
});
registerStorageProvider('aws-s3', (config, bucket) => {
  if (!config.plugins['aws-s3']) {
    throw new Error('Missing aws-s3 storage provider configuration');
  }

  return new S3StorageProvider(config.plugins['aws-s3'], bucket);
});

@Plugin({
  name: 'cloudflare-r2',
  requires: [
    'plugins.cloudflare-r2.accountId',
    'plugins.cloudflare-r2.credentials.accessKeyId',
    'plugins.cloudflare-r2.credentials.secretAccessKey',
  ],
  if: config => config.flavor.graphql,
})
export class CloudflareR2Module {}

@Plugin({
  name: 'aws-s3',
  requires: [
    'plugins.aws-s3.credentials.accessKeyId',
    'plugins.aws-s3.credentials.secretAccessKey',
  ],
  if: config => config.flavor.graphql,
})
export class AwsS3Module {}

export type { R2StorageConfig, S3StorageConfig } from './types';
