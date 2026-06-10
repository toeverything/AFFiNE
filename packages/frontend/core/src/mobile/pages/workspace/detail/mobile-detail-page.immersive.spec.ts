/**
 * @vitest-environment happy-dom
 */

import { describe, expect, test } from 'vitest';

import {
  isImmersiveTapTarget,
  isLandscapeWindow,
  isTapWithinSlop,
  shouldEnableEdgelessImmersive,
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
});
