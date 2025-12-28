import { Readable } from 'node:stream';

import { crc32 } from '@node-rs/crc32';
import type { Response } from 'express';
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

const DANGEROUS_INLINE_MIME_PREFIXES = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'text/javascript',
];

export function isDangerousInlineMime(mime: string | undefined) {
  if (!mime) return false;
  const lower = mime.toLowerCase();
  return DANGEROUS_INLINE_MIME_PREFIXES.some(p => lower.startsWith(p));
}

export function applyAttachHeaders(
  res: Response,
  options: { filename?: string; buffer?: Buffer; contentType?: string }
) {
  let { filename, buffer, contentType } = options;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!contentType && buffer) contentType = sniffMime(buffer);
  if (contentType && isDangerousInlineMime(contentType)) {
    const safeName = (filename || 'download')
      .replace(/[\r\n]/g, '')
      .replace(/[^\w\s.-]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeName)}"; filename*=UTF-8''${encodeURIComponent(
        safeName
      )}`
    );
  }
  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
  }
}

export function sniffMime(
  buffer: Buffer,
  declared?: string
): string | undefined {
  try {
    const detected = getMime(buffer);
    if (detected) return detected;
  } catch {}
  return declared;
}

export const SIGNED_URL_EXPIRED = 60 * 60; // 1 hour

export const STORAGE_PROXY_ROOT = '/api/storage';
export const PROXY_UPLOAD_PATH = `${STORAGE_PROXY_ROOT}/upload`;
export const PROXY_MULTIPART_PATH = `${STORAGE_PROXY_ROOT}/multipart`;
