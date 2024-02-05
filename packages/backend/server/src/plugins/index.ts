import type { AvailablePlugins } from '../fundamentals/config';
import { GCloudModule } from './gcloud';
import { PaymentModule } from './payment';
import { RedisModule } from './redis';
import { AwsS3Module, CloudflareR2Module } from './storage';

export const pluginsMap = new Map<AvailablePlugins, AFFiNEModule>([
  ['payment', PaymentModule],
  ['redis', RedisModule],
  ['gcloud', GCloudModule],
  ['cloudflare-r2', CloudflareR2Module],
  ['aws-s3', AwsS3Module],
]);
