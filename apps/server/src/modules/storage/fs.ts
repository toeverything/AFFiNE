import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { Config } from '../../config';

@Injectable()
export class FSService {
  constructor(private readonly config: Config) {}

  async writeFile(key: string, file: Buffer) {
    const dest = this.config.objectStorage.fs.path;
    await mkdir(dest, { recursive: true });
    const destFile = join(dest, key);
    await writeFile(destFile, file);
    return `/assets/${destFile}`;
  }
}
