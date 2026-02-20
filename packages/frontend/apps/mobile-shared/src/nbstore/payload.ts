import { base64ToUint8Array } from '@affine/core/modules/workspace-engine';
import { Capacitor } from '@capacitor/core';

export const MOBILE_BLOB_FILE_PREFIX = '__AFFINE_BLOB_FILE__:';
export const MOBILE_DOC_FILE_PREFIX = '__AFFINE_DOC_FILE__:';
export const MOBILE_PAYLOAD_INLINE_THRESHOLD_BYTES = 1024 * 1024;
const MOBILE_PAYLOAD_CACHE_DIR = 'nbstore-blob-cache';
const MOBILE_PAYLOAD_BUCKET_PATTERN = /^[0-9a-f]{16}$/;
const MOBILE_PAYLOAD_FILE_PATTERN = /^[0-9a-f]{16}\.(blob|docbin)$/;
const MOBILE_PAYLOAD_PARENT_DIRS = new Set(['cache', 'Caches', 'T', 'tmp']);

function normalizeTokenFilePath(rawPath: string): string {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    throw new Error('Invalid mobile payload token: empty file path');
  }

  return trimmedPath.startsWith('file://')
    ? trimmedPath
    : `file://${trimmedPath}`;
}

function assertMobileCachePath(fileUrl: string): void {
  let pathname: string;
  try {
    const parsedUrl = new URL(fileUrl);
    if (parsedUrl.protocol !== 'file:') {
      throw new Error('unexpected protocol');
    }
    pathname = parsedUrl.pathname;
  } catch {
    throw new Error('Invalid mobile payload token: malformed file URL');
  }

  let decodedSegments: string[];
  try {
    decodedSegments = pathname
      .split('/')
      .filter(Boolean)
      .map(segment => {
        const decoded = decodeURIComponent(segment);
        if (
          !decoded ||
          decoded === '.' ||
          decoded === '..' ||
          decoded.includes('/') ||
          decoded.includes('\\')
        ) {
          throw new Error('path traversal');
        }
        return decoded;
      });
  } catch {
    throw new Error(
      `Refusing to read mobile payload outside cache dir: ${fileUrl}`
    );
  }

  const fileName = decodedSegments.at(-1);
  const bucket = decodedSegments.at(-2);
  const cacheDir = decodedSegments.at(-3);
  const parentDir = decodedSegments.at(-4);
  const cacheParent = decodedSegments.at(-5);

  if (
    !fileName ||
    !bucket ||
    !cacheDir ||
    !parentDir ||
    cacheDir !== MOBILE_PAYLOAD_CACHE_DIR ||
    !MOBILE_PAYLOAD_BUCKET_PATTERN.test(bucket) ||
    !MOBILE_PAYLOAD_FILE_PATTERN.test(fileName) ||
    !MOBILE_PAYLOAD_PARENT_DIRS.has(parentDir) ||
    (parentDir === 'Caches' && cacheParent !== 'Library')
  ) {
    throw new Error(
      `Refusing to read mobile payload outside cache dir: ${fileUrl}`
    );
  }
}

async function readTokenPayload(filePath: string): Promise<Uint8Array> {
  const response = await fetch(Capacitor.convertFileSrc(filePath));
  if (!response.ok) {
    throw new Error(
      `Failed to read mobile payload file: ${filePath} (status ${response.status})`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

export interface DecodePayloadOptions {
  onTokenReadFailure?: (error: Error) => Promise<string | null | undefined>;
}

export async function decodePayload(
  data: string,
  prefix: string,
  options?: DecodePayloadOptions
): Promise<Uint8Array> {
  if (!data.startsWith(prefix)) {
    return base64ToUint8Array(data);
  }

  const normalizedPath = normalizeTokenFilePath(data.slice(prefix.length));
  assertMobileCachePath(normalizedPath);

  try {
    return await readTokenPayload(normalizedPath);
  } catch (error) {
    const reloadPayload = options?.onTokenReadFailure;
    if (!reloadPayload) {
      throw error;
    }

    const refreshedPayload = await reloadPayload(
      error instanceof Error ? error : new Error(String(error))
    );
    if (!refreshedPayload) {
      throw error;
    }

    return decodePayload(refreshedPayload, prefix);
  }
}
