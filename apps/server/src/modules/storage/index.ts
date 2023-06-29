import { Module } from '@nestjs/common';

import { FSService } from './fs';
import { S3 } from './s3';
import { StorageService } from './storage.service';

@Module({
  providers: [S3, StorageService, FSService],
  exports: [StorageService],
})
export class StorageModule {}
