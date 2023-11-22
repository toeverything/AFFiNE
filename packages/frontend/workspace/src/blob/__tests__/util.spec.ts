import { Buffer } from 'node:buffer';

import { describe, expect, test } from 'vitest';

import { isSvgBuffer } from '../util';

describe('isSvgBuffer', () => {
  test('basic', async () => {
    expect(isSvgBuffer(Buffer.from('<svg></svg>'))).toBe(true);
    expect(isSvgBuffer(Buffer.from(' \n\r\t<svg></svg>'))).toBe(true);
    expect(isSvgBuffer(Buffer.from('<123>'))).toBe(false);
  });
});
