import { base64ToUint8Array } from '@affine/core/modules/workspace-engine';
import { Capacitor } from '@capacitor/core';

export const MOBILE_BLOB_FILE_PREFIX = '__AFFINE_BLOB_FILE__:';
export const MOBILE_DOC_FILE_PREFIX = '__AFFINE_DOC_FILE__:';
const MOBILE_PAYLOAD_CACHE_PATH_PATTERN =
  /\/nbstore-blob-cache\/[0-9a-f]{16}\/[0-9a-f]{16}\.(blob|docbin)$/;

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
    pathname = decodeURIComponent(new URL(fileUrl).pathname);
  } catch {
    throw new Error('Invalid mobile payload token: malformed file URL');
  }

  if (
    pathname.includes('/../') ||
    pathname.includes('/./') ||
    !MOBILE_PAYLOAD_CACHE_PATH_PATTERN.test(pathname)
  ) {
    throw new Error(
      `Refusing to read mobile payload outside cache dir: ${fileUrl}`
    );
  }
}

export async function decodePayload(
  data: string,
  prefix: string
): Promise<Uint8Array> {
  if (!data.startsWith(prefix)) {
    return base64ToUint8Array(data);
  }

  const normalizedPath = normalizeTokenFilePath(data.slice(prefix.length));
  assertMobileCachePath(normalizedPath);

  const response = await fetch(Capacitor.convertFileSrc(normalizedPath));
  if (!response.ok) {
    throw new Error(
      `Failed to read mobile payload file: ${normalizedPath} (status ${response.status})`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}
