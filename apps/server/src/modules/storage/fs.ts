import { randomUUID } from 'node:crypto';
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
    const fileName = `${key}-${randomUUID()}`;
    const prefix = this.config.node.dev
      ? `${this.config.https ? 'https' : 'http'}://${this.config.host}:${
          this.config.port
        }`
      : '';
    await mkdir(dest, { recursive: true });
    const destFile = join(dest, fileName);
    await pipeline(file.createReadStream(), createWriteStream(destFile));

    return `${prefix}/assets/${fileName}`;
  }
}
