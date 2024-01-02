import { R2StorageConfig } from '../../../config/storage';
import { S3StorageProvider } from './s3';

export class R2StorageProvider extends S3StorageProvider {
  constructor(config: R2StorageConfig, bucket: string) {
    super(
      {
        ...config,
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      },
      bucket
    );
  }
}
