import assert from 'node:assert';

import { Logger } from '@nestjs/common';

import type { R2StorageConfig } from '../config';
import { S3StorageProvider } from './s3';

export class R2StorageProvider extends S3StorageProvider {
  override readonly type = 'cloudflare-r2' as any /* cast 'r2' to 's3' */;

  constructor(config: R2StorageConfig, bucket: string) {
    assert(config.accountId, 'accountId is required for R2 storage provider');
    super(
      {
        ...config,
        forcePathStyle: true,
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      },
      bucket
    );
    this.logger = new Logger(`${R2StorageProvider.name}:${bucket}`);
  }
}
