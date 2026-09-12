import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import type { BlobObjectStore } from '../../domain/ports.js';
import { MemoryBlobObjects } from './memory-objects.js';

function assertSafeKey(root: string, objectKey: string): string {
  const full = resolve(root, objectKey);
  const prefix = resolve(root) + sep;
  if (full !== resolve(root) && !full.startsWith(prefix)) {
    throw new Error('Invalid blob object key.');
  }
  return full;
}

export class FileSystemBlobObjects implements BlobObjectStore {
  constructor(private readonly root: string) {}

  async put(objectKey: string, bytes: Uint8Array): Promise<void> {
    const path = assertSafeKey(this.root, objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(objectKey: string): Promise<Uint8Array | null> {
    const path = assertSafeKey(this.root, objectKey);
    try {
      const buffer = await readFile(path);
      return Uint8Array.from(buffer);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(objectKey: string): Promise<void> {
    const path = assertSafeKey(this.root, objectKey);
    await rm(path, { force: true });
  }

  async close(): Promise<void> {}
}

export function createBlobObjects(input: {
  driver?: 'memory' | 'fs';
  dir: string;
  nodeEnv: string;
}): BlobObjectStore {
  if (
    input.driver === 'memory' ||
    (!input.driver && input.nodeEnv === 'test')
  ) {
    return new MemoryBlobObjects();
  }
  return new FileSystemBlobObjects(resolve(input.dir));
}
