import { describe, expect, test } from 'vitest';

import { embedPngMetadata, extractPngMetadata } from '../../utils/png-metadata';

const BASE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAgIB/6v3+QAAAABJRU5ErkJggg==';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

function toArrayBufferFromUint8(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

describe('png metadata', () => {
  test('embeds and extracts metadata text', () => {
    const png = Buffer.from(BASE_PNG, 'base64');
    const original = toArrayBuffer(png);
    const payload = JSON.stringify({ affine: { type: 'frame', version: 1 } });

    const enriched = embedPngMetadata(original, 'affine', payload);
    const extracted = extractPngMetadata(
      toArrayBufferFromUint8(enriched),
      'affine'
    );

    expect(extracted).toBe(payload);
  });

  test('returns null for missing keyword', () => {
    const png = Buffer.from(BASE_PNG, 'base64');
    const original = toArrayBuffer(png);
    const enriched = embedPngMetadata(original, 'affine', 'payload');

    const extracted = extractPngMetadata(
      toArrayBufferFromUint8(enriched),
      'missing'
    );

    expect(extracted).toBeNull();
  });
});
