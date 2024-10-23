import {
  accessSync,
  constants,
  createReadStream,
  Dirent,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, parse, resolve } from 'node:path';
import { Readable } from 'node:stream';

import { Logger } from '@nestjs/common';

import { FsStorageConfig } from '../config';
import {
  BlobInputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PutObjectMetadata,
  StorageProvider,
} from './provider';
import { autoMetadata, toBuffer } from './utils';

function escapeKey(key: string): string {
  // avoid '../' and './' in key
  return key.replace(/\.?\.[/\\]/g, '%');
}

export class FsStorageProvider implements StorageProvider {
  private readonly path: string;
  private readonly logger: Logger;

  readonly type = 'fs';

  constructor(
    config: FsStorageConfig,
    public readonly bucket: string
  ) {
    this.path = resolve(config.path, bucket);
    this.ensureAvailability();

    this.logger = new Logger(`${FsStorageProvider.name}:${bucket}`);
  }

  async put(
    key: string,
    body: BlobInputType,
    metadata: PutObjectMetadata = {}
  ): Promise<void> {
    key = escapeKey(key);
    const blob = await toBuffer(body);

    // write object
    this.writeObject(key, blob);
    // write metadata
    await this.writeMetadata(key, blob, metadata);
    this.logger.verbose(`Object \`${key}\` put`);
  }

  async get(key: string): Promise<{
    body?: Readable;
    metadata?: GetObjectMetadata;
  }> {
    key = escapeKey(key);

    try {
      const metadata = this.readMetadata(key);
      const stream = this.readObject(this.join(key));
      this.logger.verbose(`Read object \`${key}\``);
      return {
        body: stream,
        metadata,
      };
    } catch (e) {
      this.logger.error(`Failed to read object \`${key}\``, e);
      return {};
    }
  }

  async list(prefix?: string): Promise<ListObjectsMetadata[]> {
    // prefix cases:
    // - `undefined`: list all objects
    // - `a/b`: list objects under dir `a` with prefix `b`, `b` might be a dir under `a` as well.
    // - `a/b/` list objects under dir `a/b`

    // read dir recursively and filter out '.metadata.json' files
    let dir = this.path;
    if (prefix) {
      prefix = escapeKey(prefix);
      const parts = prefix.split(/[/\\]/);
      // for prefix `a/b/c`, move `a/b` to dir and `c` to key prefix
      if (parts.length > 1) {
        dir = join(dir, ...parts.slice(0, -1));
        prefix = parts[parts.length - 1];
      }
    }

    const results: ListObjectsMetadata[] = [];
    async function getFiles(dir: string, prefix?: string): Promise<void> {
      try {
        const entries: Dirent[] = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const res = join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!prefix || entry.name.startsWith(prefix)) {
              await getFiles(res);
            }
          } else if (
            (!prefix || entry.name.startsWith(prefix)) &&
            !entry.name.endsWith('.metadata.json')
          ) {
            const stat = statSync(res);
            results.push({
              key: res,
              lastModified: stat.mtime,
              contentLength: stat.size,
            });
          }
        }
      } catch {
        // failed to read dir, stop recursion
      }
    }

    await getFiles(dir, prefix);

    // trim path with `this.path` prefix
    results.forEach(r => (r.key = r.key.slice(this.path.length + 1)));

    return results;
  }

  delete(key: string): Promise<void> {
    key = escapeKey(key);

    try {
      rmSync(this.join(key), { force: true });
      rmSync(this.join(`${key}.metadata.json`), { force: true });
    } catch (e) {
      throw new Error(`Failed to delete object \`${key}\``, {
        cause: e,
      });
    }

    this.logger.verbose(`Object \`${key}\` deleted`);

    return Promise.resolve();
  }

  ensureAvailability() {
    // check stats
    const stats = statSync(this.path, {
      throwIfNoEntry: false,
    });

    // not existing, create it
    if (!stats) {
      try {
        mkdirSync(this.path, { recursive: true });
      } catch (e) {
        throw new Error(
          `Failed to create target directory for fs storage provider: ${this.path}`,
          {
            cause: e,
          }
        );
      }
    } else if (stats.isDirectory()) {
      // the target directory has already existed, check if it is readable & writable
      try {
        accessSync(this.path, constants.W_OK | constants.R_OK);
      } catch (e) {
        throw new Error(
          `The target directory for fs storage provider has already existed, but it is not readable & writable: ${this.path}`,
          {
            cause: e,
          }
        );
      }
    } else if (stats.isFile()) {
      throw new Error(
        `The target directory for fs storage provider is a file: ${this.path}`
      );
    }
  }

  private join(...paths: string[]) {
    return join(this.path, ...paths);
  }

  private readObject(file: string): Readable | undefined {
    const state = statSync(file, { throwIfNoEntry: false });

    if (state?.isFile()) {
      return createReadStream(file);
    }

    return undefined;
  }

  private writeObject(key: string, blob: Buffer) {
    const path = this.join(key);
    mkdirSync(parse(path).dir, { recursive: true });
    writeFileSync(path, blob);
  }

  private async writeMetadata(
    key: string,
    blob: Buffer,
    raw: PutObjectMetadata
  ) {
    try {
      const metadata = await autoMetadata(blob, raw);

      if (raw.checksumCRC32 && metadata.checksumCRC32 !== raw.checksumCRC32) {
        throw new Error(
          'The checksum of the uploaded file is not matched with the one you provide, the file may be corrupted and the uploading will not be processed.'
        );
      }

      writeFileSync(
        this.join(`${key}.metadata.json`),
        JSON.stringify({
          ...metadata,
          lastModified: Date.now(),
        })
      );
    } catch (e) {
      this.logger.warn(`Failed to write metadata of object \`${key}\``, e);
    }
  }

  private readMetadata(key: string): GetObjectMetadata | undefined {
    try {
      const raw = JSON.parse(
        readFileSync(this.join(`${key}.metadata.json`), {
          encoding: 'utf-8',
        })
      );

      return {
        ...raw,
        lastModified: new Date(raw.lastModified),
        expires: raw.expires ? new Date(raw.expires) : undefined,
      };
    } catch (e) {
      this.logger.warn(`Failed to read metadata of object \`${key}\``, e);

      return;
    }
  }
}
