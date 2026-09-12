const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46];
const PDF = [0x25, 0x50, 0x44, 0x46];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.byteLength < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function declaredType(declared: string): string {
  return declared.split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Trust magic bytes over the client-supplied MIME. SVG is never served as
 * image/svg+xml (scriptable); unknown bytes become octet-stream.
 */
export function sniffMime(bytes: Uint8Array, declared: string): string {
  if (startsWith(bytes, PNG)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG)) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, GIF)) {
    return 'image/gif';
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (startsWith(bytes, PDF)) {
    return 'application/pdf';
  }

  const type = declaredType(declared);
  if (type.startsWith('image/') && type !== 'image/svg+xml') {
    return type;
  }
  if (
    type === 'text/plain' ||
    type === 'application/json' ||
    type === 'application/octet-stream'
  ) {
    return type;
  }
  return 'application/octet-stream';
}
