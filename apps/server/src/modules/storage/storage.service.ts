import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import { crc32 } from '@node-rs/crc32';
import { fileTypeFromBuffer } from 'file-type';
import { getStreamAsBuffer } from 'get-stream';

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
    if (this.config.objectStorage.r2.enabled) {
      const readableFile = file.createReadStream();
      const fileBuffer = await getStreamAsBuffer(readableFile);
      const mime = (await fileTypeFromBuffer(fileBuffer))?.mime;
      const crc32Value = crc32(fileBuffer);
      const keyWithCrc32 = `${crc32Value}-${key}`;
      await this.s3.send(
        new PutObjectCommand({
          Body: fileBuffer,
          Bucket: this.config.objectStorage.r2.bucket,
          Key: keyWithCrc32,
          ContentLength: fileBuffer.length,
          ContentType: mime,
        })
      );
      return `https://avatar.affineassets.com/${keyWithCrc32}`;
    } else {
      return this.fs.writeFile(key, file);
    }
  }
}
