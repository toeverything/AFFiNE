import { S3Client } from '@aws-sdk/client-s3';
import { FactoryProvider } from '@nestjs/common';

import { Config } from '../../config';

export const S3_SERVICE = Symbol('S3_SERVICE');

export const S3: FactoryProvider<S3Client> = {
  provide: S3_SERVICE,
  useFactory: (config: Config) => {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.objectStorage.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.objectStorage.r2.accessKeyId,
        secretAccessKey: config.objectStorage.r2.secretAccessKey,
      },
    });
    return s3;
  },
  inject: [Config],
};
