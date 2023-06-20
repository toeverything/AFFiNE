import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';

import { Injectable } from '@nestjs/common';
import { crc32 } from '@node-rs/crc32';

import { Config } from '../../config';
import { FileUpload } from '../../types';

@Injectable()
export class FSService {
  constructor(private readonly config: Config) {}

  async writeFile(key: string, file: FileUpload) {
    const dest = this.config.objectStorage.fs.path;
    await mkdir(dest, { recursive: true });
    let crc = 0;
    let buffer = Buffer.alloc(0);
    await finished(
      file.createReadStream().on('data', chunk => {
        crc = crc32(chunk, crc);
        buffer = Buffer.concat([buffer, chunk]);
      })
    );
    const destFile = join(dest, `${crc}-${key}`);

    await writeFile(destFile, buffer);

    return `/assets/${destFile}`;
  }
}
