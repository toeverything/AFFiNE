import { describe, expect, test } from 'vitest';

import * as turboRendererModule from '../../../../gfx/turbo-renderer/src/turbo-renderer.js';

describe('viewport turbo renderer policy', () => {
  test.each([
    { isIOS: true, zoom: 0.4, hasBitmap: true, expected: true },
    { isIOS: true, zoom: 0.4, hasBitmap: false, expected: false },
    { isIOS: false, zoom: 0.4, hasBitmap: true, expected: false },
    { isIOS: true, zoom: 0.8, hasBitmap: true, expected: false },
  ])(
    'prefers cached bitmap only for iOS low-zoom gestures with a bitmap %#',
    ({ isIOS, zoom, hasBitmap, expected }) => {
      expect(
        'shouldPreferBitmapCacheDuringLowZoomGesture' in turboRendererModule
      ).toBe(true);

      const shouldPreferBitmapCacheDuringLowZoomGesture = (
        turboRendererModule as {
          shouldPreferBitmapCacheDuringLowZoomGesture: (params: {
            isIOS: boolean;
            zoom: number;
            hasBitmap: boolean;
          }) => boolean;
        }
      ).shouldPreferBitmapCacheDuringLowZoomGesture;

      expect(
        shouldPreferBitmapCacheDuringLowZoomGesture({
          isIOS,
          zoom,
          hasBitmap,
        })
      ).toBe(expected);
    }
  );

  test.each([
    { isIOS: true, zoom: 0.4, expected: false },
    { isIOS: true, zoom: 0.8, expected: true },
    { isIOS: false, zoom: 0.4, expected: true },
  ])(
    'idles turbo blocks outside iOS low-zoom survival mode %#',
    ({ isIOS, zoom, expected }) => {
      expect('shouldIdleTurboBlocksDuringZooming' in turboRendererModule).toBe(
        true
      );

      const shouldIdleTurboBlocksDuringZooming = (
        turboRendererModule as {
          shouldIdleTurboBlocksDuringZooming: (params: {
            isIOS: boolean;
            zoom: number;
          }) => boolean;
        }
      ).shouldIdleTurboBlocksDuringZooming;

      expect(
        shouldIdleTurboBlocksDuringZooming({
          isIOS,
          zoom,
        })
      ).toBe(expected);
    }
  );
});
