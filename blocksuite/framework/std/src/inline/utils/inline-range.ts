import type { InlineRange } from '../types.js';

export function isMaybeInlineRangeEqual(
  a: InlineRange | null,
  b: InlineRange | null
): boolean {
  return a === b || (a && b ? isInlineRangeEqual(a, b) : false);
}

export function isInlineRangeContain(a: InlineRange, b: InlineRange): boolean {
  return a.index <= b.index && a.index + a.length >= b.index + b.length;
}

export function isInlineRangeEqual(a: InlineRange, b: InlineRange): boolean {
  return a.index === b.index && a.length === b.length;
}

export function isInlineRangeIntersect(
  a: InlineRange,
  b: InlineRange
): boolean {
  return a.index <= b.index + b.length && a.index + a.length >= b.index;
}

export function isInlineRangeBefore(a: InlineRange, b: InlineRange): boolean {
  return a.index + a.length <= b.index;
}

export function isInlineRangeAfter(a: InlineRange, b: InlineRange): boolean {
  return a.index >= b.index + b.length;
}

export function isInlineRangeEdge(
  index: InlineRange['index'],
  range: InlineRange
): boolean {
  return index === range.index || index === range.index + range.length;
}

export function isInlineRangeEdgeBefore(
  index: InlineRange['index'],
  range: InlineRange
): boolean {
  return index === range.index;
}

export function isInlineRangeEdgeAfter(
  index: InlineRange['index'],
  range: InlineRange
): boolean {
  return index === range.index + range.length;
}

export function isPoint(range: InlineRange): boolean {
  return range.length === 0;
}

/**
 * Whether a `getTargetRanges()`-derived inline range should be trusted over
 * the range already resolved from the live selection, in
 * `EventService._onBeforeInput`.
 *
 * `event.getTargetRanges()` is sometimes MORE accurate than resolving the
 * live selection directly -- e.g. the browser can report a selection via an
 * element-anchored boundary point (an ancestor element + child index) that
 * the direct live-selection resolution collapses incorrectly to the end of
 * the text, and the target-range conversion recovers the real, non-collapsed
 * range. But it can also be LESS accurate for what is otherwise the same
 * selection shape: observed flipping between an element-anchored boundary
 * (recovers correctly) and a text-node-anchored boundary (already correct on
 * its own, then gets overwritten with a collapsed range) for seemingly
 * identical user selections in the same component from one keystroke to the
 * next (`.planning/debug/row-index0-selection-delete.md`, re-opened
 * 2026-09-24 section). The one invariant that always holds regardless of
 * which representation the browser used: a real, non-collapsed selection the
 * user is trying to delete/replace should never be silently reduced to a
 * collapsed (no-op) range by this override.
 */
export function shouldAcceptTargetRange(
  current: InlineRange,
  target: InlineRange
): boolean {
  if (isInlineRangeEqual(current, target)) {
    return false;
  }
  if (!isPoint(current) && isPoint(target)) {
    return false;
  }
  return true;
}

export function mergeInlineRange(a: InlineRange, b: InlineRange): InlineRange {
  const index = Math.min(a.index, b.index);
  const length = Math.max(a.index + a.length, b.index + b.length) - index;
  return { index, length };
}

export function intersectInlineRange(
  a: InlineRange,
  b: InlineRange
): InlineRange | null {
  if (!isInlineRangeIntersect(a, b)) {
    return null;
  }
  const index = Math.max(a.index, b.index);
  const length = Math.min(a.index + a.length, b.index + b.length) - index;
  return { index, length };
}
