import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { FileUpload } from '../../types';

@Injectable()
export class FSService {
  constructor(private readonly config: Config) {}

  async writeFile(key: string, file: FileUpload) {
    const dest = this.config.objectStorage.fs.path;
    await mkdir(dest, { recursive: true });
    const destFile = join(dest, key);
    await pipeline(file.createReadStream(), createWriteStream(destFile));

    return `/assets/${destFile}`;
  }
}
