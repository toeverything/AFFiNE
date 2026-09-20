/**
 * @vitest-environment happy-dom
 */

import { describe, expect, test } from 'vitest';

import * as immersiveModule from './mobile-detail-page.immersive';
import {
  getImmersiveZoomToolbarBottom,
  isImmersiveTapTarget,
  isLandscapeWindow,
  isTapWithinSlop,
  shouldEnableEdgelessImmersive,
  shouldLockEdgelessDocumentScroll,
  shouldShowMobileDetailPageTitle,
  shouldTrackMobileDetailPageTitleScroll,
} from './mobile-detail-page.immersive';

describe('mobile detail page immersive helpers', () => {
  test('enables immersive mode only for edgeless landscape', () => {
    expect(
      shouldEnableEdgelessImmersive({ mode: 'edgeless', isLandscape: true })
    ).toBe(true);
    expect(
      shouldEnableEdgelessImmersive({ mode: 'page', isLandscape: true })
    ).toBe(false);
    expect(
      shouldEnableEdgelessImmersive({ mode: 'edgeless', isLandscape: false })
    ).toBe(false);
  });

  test('treats window as landscape only when media query and geometry agree', () => {
    expect(
      isLandscapeWindow({
        width: 844,
        height: 390,
        matchesLandscape: true,
      })
    ).toBe(true);

    expect(
      isLandscapeWindow({
        width: 390,
        height: 844,
        matchesLandscape: true,
      })
    ).toBe(false);

    expect(
      isLandscapeWindow({
        width: 844,
        height: 390,
        matchesLandscape: false,
      })
    ).toBe(false);
  });

  test('marks mismatched orientation signals as unsettled so immersive mode can retry the first rotation sample', () => {
    expect('getLandscapeWindowMeasurement' in immersiveModule).toBe(true);

    const getLandscapeWindowMeasurement = (
      immersiveModule as {
        getLandscapeWindowMeasurement: (params: {
          width: number;
          height: number;
          matchesLandscape: boolean;
        }) => {
          isLandscape: boolean;
          settled: boolean;
        };
      }
    ).getLandscapeWindowMeasurement;

    expect(
      getLandscapeWindowMeasurement({
        width: 844,
        height: 390,
        matchesLandscape: false,
      })
    ).toEqual({
      isLandscape: false,
      settled: false,
    });

    expect(
      getLandscapeWindowMeasurement({
        width: 390,
        height: 844,
        matchesLandscape: true,
      })
    ).toEqual({
      isLandscape: false,
      settled: false,
    });

    expect(
      getLandscapeWindowMeasurement({
        width: 844,
        height: 390,
        matchesLandscape: true,
      })
    ).toEqual({
      isLandscape: true,
      settled: true,
    });
  });

  test('ignores taps from edgeless toolbar chrome targets', () => {
    const toolbar = document.createElement('edgeless-toolbar-widget');
    const toolbarButton = document.createElement('button');
    toolbar.append(toolbarButton);

    const zoomToolbar = document.createElement('div');
    zoomToolbar.className = 'edgeless-zoom-toolbar-container';
    const zoomButton = document.createElement('button');
    zoomToolbar.append(zoomButton);

    const selectedRect = document.createElement('div');
    selectedRect.className = 'affine-edgeless-selected-rect';
    const resizeHandle = document.createElement('div');
    selectedRect.append(resizeHandle);

    const canvas = document.createElement('div');

    document.body.append(toolbar, zoomToolbar, selectedRect, canvas);

    expect(isImmersiveTapTarget(toolbarButton)).toBe(false);
    expect(isImmersiveTapTarget(zoomButton)).toBe(false);
    expect(isImmersiveTapTarget(resizeHandle)).toBe(false);
    expect(isImmersiveTapTarget(canvas)).toBe(true);
    expect(isImmersiveTapTarget(null)).toBe(false);
  });

  test('accepts only small pointer movement as a tap', () => {
    expect(
      isTapWithinSlop(
        { clientX: 100, clientY: 200 },
        { clientX: 104, clientY: 205 }
      )
    ).toBe(true);

    expect(
      isTapWithinSlop(
        { clientX: 100, clientY: 200 },
        { clientX: 120, clientY: 205 }
      )
    ).toBe(false);
  });

  test('raises zoom toolbar above tab bar only when immersive chrome is visible', () => {
    expect(
      getImmersiveZoomToolbarBottom({
        immersive: true,
        chromeVisible: false,
      })
    ).toBe('10px');

    expect(
      getImmersiveZoomToolbarBottom({
        immersive: true,
        chromeVisible: true,
        tabBarOffset: 'var(--appTabSafeArea)',
      })
    ).toBe('calc(10px + var(--appTabSafeArea))');

    expect(
      getImmersiveZoomToolbarBottom({
        immersive: false,
        chromeVisible: true,
        tabBarOffset: 'var(--appTabSafeArea)',
      })
    ).toBeUndefined();
  });

  test('locks document scroll whenever edgeless mode is active', () => {
    expect(shouldLockEdgelessDocumentScroll('edgeless')).toBe(true);
    expect(shouldLockEdgelessDocumentScroll('page')).toBe(false);
  });

  test('tracks title scroll only in page mode', () => {
    expect(shouldTrackMobileDetailPageTitleScroll('page')).toBe(true);
    expect(shouldTrackMobileDetailPageTitleScroll('edgeless')).toBe(false);
  });

  test('shows title only after crossing the existing scroll threshold', () => {
    expect(shouldShowMobileDetailPageTitle(157)).toBe(false);
    expect(shouldShowMobileDetailPageTitle(158)).toBe(true);
    expect(shouldShowMobileDetailPageTitle(240)).toBe(true);
  });
});
