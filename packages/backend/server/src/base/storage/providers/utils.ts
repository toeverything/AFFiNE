import { Readable } from 'node:stream';

import { crc32 } from '@node-rs/crc32';
import { getStreamAsBuffer } from 'get-stream';

import { getMime } from '../../../native';
import { BlobInputType, PutObjectMetadata } from './provider';

export async function toBuffer(input: BlobInputType): Promise<Buffer> {
  return input instanceof Readable
    ? await getStreamAsBuffer(input)
    : input instanceof Buffer
      ? input
      : Buffer.from(input as string);
}

export function autoMetadata(
  blob: Buffer,
  raw: PutObjectMetadata = {}
): PutObjectMetadata {
  const metadata = {
    ...raw,
  };

  if (!metadata.contentLength) {
    metadata.contentLength = blob.byteLength;
  }

  try {
    // checksum
    if (!metadata.checksumCRC32) {
      metadata.checksumCRC32 = crc32(blob).toString(16);
    }

    // mime type
    if (!metadata.contentType) {
      metadata.contentType = getMime(blob);
    }
  } catch {
    // noop
  }

  return metadata;
}

export const SIGNED_URL_EXPIRED = 60 * 60; // 1 hour
