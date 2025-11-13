import { Readable } from 'node:stream';

import { BlobQuotaExceeded, StorageQuotaExceeded } from '../error';
import { OneKB } from './unit';

export type CheckExceededResult =
  | {
      storageQuotaExceeded: boolean;
      blobQuotaExceeded: boolean;
    }
  | undefined;

export async function readBuffer(
  readable: Readable,
  checkExceeded: (recvSize: number) => CheckExceededResult
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    let result: CheckExceededResult;

    readable.on('data', chunk => {
      totalSize += chunk.length;

      // check size after receive each chunk to avoid unnecessary memory usage
      result = checkExceeded(totalSize);
      if (result?.blobQuotaExceeded) {
        reject(new BlobQuotaExceeded());
      } else if (result?.storageQuotaExceeded) {
        reject(new StorageQuotaExceeded());
      }

      if (checkExceeded(totalSize)) {
        reject(new BlobQuotaExceeded());
        readable.destroy(new BlobQuotaExceeded());
        return;
      }
      chunks.push(chunk);
    });

    readable.on('error', reject);
    readable.on('end', () => {
      const buffer = Buffer.concat(chunks, totalSize);

      if (checkExceeded(buffer.length)) {
        reject(new BlobQuotaExceeded());
      } else {
        resolve(buffer);
      }
    });
  });
}

export async function readBufferWithLimit(
  readable: Readable,
  limit: number = 500 * OneKB
): Promise<Buffer> {
  return readBuffer(readable, size =>
    size > limit
      ? { blobQuotaExceeded: true, storageQuotaExceeded: false }
      : undefined
  );
}

export async function readableToBuffer(readable: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
