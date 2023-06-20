import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { FileUpload } from '../../types';
import { FSService } from './fs';
import { S3_SERVICE } from './s3';

@Injectable()
export class StorageService {
  constructor(
    @Inject(S3_SERVICE) private readonly s3: S3Client,
    private readonly fs: FSService,
    private readonly config: Config
  ) {}

  async uploadFile(key: string, file: FileUpload) {
    if (this.config.objectStorage.enable) {
      await this.s3.send(
        new PutObjectCommand({
          Body: file.createReadStream(),
          Bucket: this.config.objectStorage.config.bucket,
          Key: key,
        })
      );
      return `https://avatar.affineassets.com/${key}`;
    } else {
      return this.fs.writeFile(key, file);
    }
  }
}
