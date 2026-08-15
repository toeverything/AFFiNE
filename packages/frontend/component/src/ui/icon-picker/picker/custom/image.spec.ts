import { describe, expect, test } from 'vitest';

import {
  ALLOWED_TYPES,
  computeResizeDimensions,
  hasTransparency,
  MAX_FILE_SIZE,
  MAX_SVG_FILE_SIZE,
  resizeImage,
  validateIconFile,
} from './image';

describe('validateIconFile', () => {
  test('accepts every allowed type within the size cap', () => {
    for (const type of ALLOWED_TYPES) {
      expect(validateIconFile({ type, size: 1024 })).toBeNull();
    }
  });

  test('rejects unsupported types', () => {
    expect(validateIconFile({ type: 'image/bmp', size: 1024 })).toBe(
      'unsupported-type'
    );
    expect(validateIconFile({ type: 'application/pdf', size: 1024 })).toBe(
      'unsupported-type'
    );
  });

  test('rejects files over the size cap', () => {
    expect(
      validateIconFile({ type: 'image/png', size: MAX_FILE_SIZE + 1 })
    ).toBe('too-large');
  });

  test('accepts files exactly at the size cap', () => {
    expect(
      validateIconFile({ type: 'image/png', size: MAX_FILE_SIZE })
    ).toBeNull();
  });

  test('caps SVG tighter since it is stored verbatim', () => {
    expect(
      validateIconFile({ type: 'image/svg+xml', size: MAX_SVG_FILE_SIZE })
    ).toBeNull();
    expect(
      validateIconFile({ type: 'image/svg+xml', size: MAX_SVG_FILE_SIZE + 1 })
    ).toBe('svg-too-large');
    // a raster of the same size is fine — it gets resized and re-encoded
    expect(
      validateIconFile({ type: 'image/png', size: MAX_SVG_FILE_SIZE + 1 })
    ).toBeNull();
  });
});

describe('hasTransparency', () => {
  test('detects a semi-transparent pixel (alpha < 255)', () => {
    // 2×1 RGBA: first pixel opaque, second pixel alpha 128
    const data = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 128,
    ]);
    expect(hasTransparency(data)).toBe(true);
  });

  test('returns false when every pixel is opaque', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    ]);
    expect(hasTransparency(data)).toBe(false);
  });

  test('returns false for empty data', () => {
    expect(hasTransparency(new Uint8ClampedArray())).toBe(false);
  });
});

describe('resizeImage', () => {
  test('passes SVG files through untouched', async () => {
    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
      'icon.svg',
      { type: 'image/svg+xml' }
    );
    await expect(resizeImage(file)).resolves.toBe(file);
  });
});

describe('computeResizeDimensions', () => {
  test('downscales a large image to fit the target, preserving aspect ratio', () => {
    expect(computeResizeDimensions(512, 256, 128)).toEqual({
      width: 128,
      height: 64,
    });
  });

  test('never upscales a small image', () => {
    expect(computeResizeDimensions(32, 32, 128)).toEqual({
      width: 32,
      height: 32,
    });
  });

  test('scales tall images by their height', () => {
    expect(computeResizeDimensions(100, 400, 128)).toEqual({
      width: 32,
      height: 128,
    });
  });

  test('never returns a dimension below 1px', () => {
    expect(computeResizeDimensions(1, 10000, 128)).toEqual({
      width: 1,
      height: 128,
    });
  });
});
