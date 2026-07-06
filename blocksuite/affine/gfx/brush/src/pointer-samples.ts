import type { PointerEventState } from '@blocksuite/std';

export type PointerSample = {
  /** X in container (viewport) space, matching `PointerEventState.point`. */
  x: number;
  /** Y in container (viewport) space, matching `PointerEventState.point`. */
  y: number;
  pressure: number;
};

/**
 * Expand a pointer event into its full-resolution samples.
 *
 * Browsers throttle `pointermove` to the display refresh rate, but an Apple
 * Pencil samples far faster (up to ~240Hz). `getCoalescedEvents()` recovers the
 * dropped in-between samples so freehand strokes stay smooth at speed. On mouse,
 * touch, or Simulator input there is a single sample, so behavior is unchanged.
 */
export function getPointerSamples(e: PointerEventState): PointerSample[] {
  const coalesced = e.raw.getCoalescedEvents?.();
  if (!coalesced || coalesced.length <= 1) {
    return [{ x: e.point.x, y: e.point.y, pressure: e.pressure }];
  }

  const { x: offsetX, y: offsetY } = e.containerOffset;
  return coalesced.map(ev => ({
    x: ev.clientX - offsetX,
    y: ev.clientY - offsetY,
    pressure: ev.pressure,
  }));
}
