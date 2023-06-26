import { S3Client } from '@aws-sdk/client-s3';
import { FactoryProvider } from '@nestjs/common';

import { Config } from '../../config';

export const S3_SERVICE = Symbol('S3_SERVICE');

export const S3: FactoryProvider<S3Client> = {
  provide: S3_SERVICE,
  useFactory: (config: Config) => {
    const s3 = new S3Client(config.objectStorage.config);
    return s3;
  },
  inject: [Config],
};
