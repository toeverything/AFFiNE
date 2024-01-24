import { Logger } from '@nestjs/common';

import { R2StorageConfig } from '../../config/storage';
import { S3StorageProvider } from './s3';

export class R2StorageProvider extends S3StorageProvider {
  override readonly type = 'r2' as any /* cast 'r2' to 's3' */;

  constructor(config: R2StorageConfig, bucket: string) {
    super(
      {
        ...config,
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      },
      bucket
    );
    this.logger = new Logger(`${R2StorageProvider.name}:${bucket}`);
  }
}
