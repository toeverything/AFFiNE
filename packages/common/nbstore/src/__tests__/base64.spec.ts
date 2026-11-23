import { describe, expect, test } from 'vitest';

import { base64ToUint8Array, uint8ArrayToBase64 } from '../impls/cloud/socket';

function makeSample(size: number) {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 251;
  }
  return data;
}

describe('base64 helpers', () => {
  test('roundtrip preserves data', async () => {
    const input = makeSample(1024);
    const encoded = await uint8ArrayToBase64(input);
    const decoded = base64ToUint8Array(encoded);
    expect(decoded).toEqual(input);
  });

  test('handles large payloads', async () => {
    const input = makeSample(256 * 1024);
    const encoded = await uint8ArrayToBase64(input);
    const decoded = base64ToUint8Array(encoded);
    expect(decoded).toEqual(input);
  });
});
