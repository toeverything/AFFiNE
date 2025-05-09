import { nanoid } from 'nanoid';

import { ZOOM_WHEEL_STEP } from '../consts.js';

export { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

export function generateElementId() {
  return nanoid(10);
}

/**
 * Normalizes wheel delta.
 *
 * See https://stackoverflow.com/a/13650579
 *
 * From https://github.com/excalidraw/excalidraw/blob/master/src/components/App.tsx
 * MIT License
 */
export function normalizeWheelDeltaY(delta: number, zoom = 1) {
  const sign = Math.sign(delta);
  const abs = Math.abs(delta);
  const maxStep = ZOOM_WHEEL_STEP * 100;
  if (abs > maxStep) {
    delta = maxStep * sign;
  }
  let newZoom = zoom - delta / 100;
  // increase zoom steps the more zoomed-in we are (applies to >100% only)
  newZoom +=
    Math.log10(Math.max(1, zoom)) *
    -sign *
    // reduced amplification for small deltas (small movements on a trackpad)
    Math.min(1, abs / 20);
  return newZoom;
}

export { getBgGridGap } from './get-bg-grip-gap';
export { getLastPropsKey } from './get-last-props-key';
export * from './get-surface-block';
