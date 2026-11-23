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
