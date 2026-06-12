import { describe, expect, test } from 'vitest';

import * as turboRendererModule from '../../../../gfx/turbo-renderer/src/turbo-renderer.js';

describe('viewport turbo renderer policy', () => {
  test('prefers cached bitmap over placeholder during iOS low-zoom gestures', () => {
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
        isIOS: true,
        zoom: 0.4,
        hasBitmap: true,
      })
    ).toBe(true);

    expect(
      shouldPreferBitmapCacheDuringLowZoomGesture({
        isIOS: true,
        zoom: 0.4,
        hasBitmap: false,
      })
    ).toBe(false);

    expect(
      shouldPreferBitmapCacheDuringLowZoomGesture({
        isIOS: false,
        zoom: 0.4,
        hasBitmap: true,
      })
    ).toBe(false);

    expect(
      shouldPreferBitmapCacheDuringLowZoomGesture({
        isIOS: true,
        zoom: 0.8,
        hasBitmap: true,
      })
    ).toBe(false);
  });

  test('does not idle turbo blocks during iOS low-zoom gestures', () => {
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
        isIOS: true,
        zoom: 0.4,
      })
    ).toBe(false);

    expect(
      shouldIdleTurboBlocksDuringZooming({
        isIOS: true,
        zoom: 0.8,
      })
    ).toBe(true);

    expect(
      shouldIdleTurboBlocksDuringZooming({
        isIOS: false,
        zoom: 0.4,
      })
    ).toBe(true);
  });

  test('records turbo renderer diagnostic counters', () => {
    expect('recordTurboRendererDiagCounter' in turboRendererModule).toBe(true);

    const recordTurboRendererDiagCounter = (
      turboRendererModule as {
        recordTurboRendererDiagCounter: (
          counters: Record<string, number>,
          event:
            | 'zoom-placeholder-paint'
            | 'zoom-bitmap-reuse'
            | 'zoom-idle-skip'
            | 'zoom-idle-apply'
        ) => void;
      }
    ).recordTurboRendererDiagCounter;

    const counters: Record<string, number> = {};

    recordTurboRendererDiagCounter(counters, 'zoom-placeholder-paint');
    recordTurboRendererDiagCounter(counters, 'zoom-bitmap-reuse');
    recordTurboRendererDiagCounter(counters, 'zoom-idle-skip');
    recordTurboRendererDiagCounter(counters, 'zoom-idle-skip');
    recordTurboRendererDiagCounter(counters, 'zoom-idle-apply');

    expect(counters.turboZoomPlaceholderPaintCount).toBe(1);
    expect(counters.turboZoomBitmapReuseCount).toBe(1);
    expect(counters.turboZoomIdleSkipCount).toBe(2);
    expect(counters.turboZoomIdleApplyCount).toBe(1);
  });
});
