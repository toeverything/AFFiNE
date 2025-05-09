import { expect, test } from 'vitest';

import {
  intersectInlineRange,
  isInlineRangeAfter,
  isInlineRangeBefore,
  isInlineRangeContain,
  isInlineRangeEdge,
  isInlineRangeEdgeAfter,
  isInlineRangeEdgeBefore,
  isInlineRangeEqual,
  isInlineRangeIntersect,
  isPoint,
  mergeInlineRange,
} from '../../inline/utils/inline-range.js';

test('isInlineRangeContain', () => {
  expect(
    isInlineRangeContain({ index: 0, length: 0 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeContain({ index: 0, length: 0 }, { index: 0, length: 2 })
  ).toEqual(false);

  expect(
    isInlineRangeContain({ index: 0, length: 2 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeContain({ index: 0, length: 2 }, { index: 0, length: 1 })
  ).toEqual(true);

  expect(
    isInlineRangeContain({ index: 0, length: 2 }, { index: 0, length: 2 })
  ).toEqual(true);

  expect(
    isInlineRangeContain({ index: 1, length: 3 }, { index: 0, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeContain({ index: 1, length: 3 }, { index: 0, length: 1 })
  ).toEqual(false);

  expect(
    isInlineRangeContain({ index: 1, length: 3 }, { index: 0, length: 2 })
  ).toEqual(false);

  expect(
    isInlineRangeContain({ index: 1, length: 4 }, { index: 2, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeContain({ index: 1, length: 4 }, { index: 2, length: 3 })
  ).toEqual(true);

  expect(
    isInlineRangeContain({ index: 1, length: 4 }, { index: 2, length: 4 })
  ).toEqual(false);
});

test('isInlineRangeEqual', () => {
  expect(
    isInlineRangeEqual({ index: 0, length: 0 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeEqual({ index: 0, length: 2 }, { index: 0, length: 1 })
  ).toEqual(false);

  expect(
    isInlineRangeEqual({ index: 1, length: 3 }, { index: 1, length: 3 })
  ).toEqual(true);

  expect(
    isInlineRangeEqual({ index: 0, length: 0 }, { index: 1, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeEqual({ index: 2, length: 0 }, { index: 2, length: 0 })
  ).toEqual(true);
});

test('isInlineRangeIntersect', () => {
  expect(
    isInlineRangeIntersect({ index: 0, length: 2 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeIntersect({ index: 0, length: 2 }, { index: 2, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeIntersect({ index: 0, length: 0 }, { index: 1, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeIntersect({ index: 1, length: 0 }, { index: 1, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeIntersect({ index: 1, length: 0 }, { index: 0, length: 1 })
  ).toEqual(true);

  expect(
    isInlineRangeIntersect({ index: 1, length: 0 }, { index: 0, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeIntersect({ index: 1, length: 0 }, { index: 2, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeIntersect({ index: 1, length: 0 }, { index: 0, length: 2 })
  ).toEqual(true);
});

test('isInlineRangeBefore', () => {
  expect(
    isInlineRangeBefore({ index: 0, length: 1 }, { index: 2, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeBefore({ index: 2, length: 0 }, { index: 0, length: 1 })
  ).toEqual(false);

  expect(
    isInlineRangeBefore({ index: 0, length: 0 }, { index: 1, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeBefore({ index: 1, length: 0 }, { index: 0, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeBefore({ index: 0, length: 0 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeBefore({ index: 0, length: 0 }, { index: 0, length: 1 })
  ).toEqual(true);

  expect(
    isInlineRangeBefore({ index: 0, length: 1 }, { index: 0, length: 0 })
  ).toEqual(false);
});

test('isInlineRangeAfter', () => {
  expect(
    isInlineRangeAfter({ index: 2, length: 0 }, { index: 0, length: 1 })
  ).toEqual(true);

  expect(
    isInlineRangeAfter({ index: 0, length: 1 }, { index: 2, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeAfter({ index: 1, length: 0 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeAfter({ index: 0, length: 0 }, { index: 1, length: 0 })
  ).toEqual(false);

  expect(
    isInlineRangeAfter({ index: 0, length: 0 }, { index: 0, length: 0 })
  ).toEqual(true);

  expect(
    isInlineRangeAfter({ index: 0, length: 0 }, { index: 0, length: 1 })
  ).toEqual(false);

  expect(
    isInlineRangeAfter({ index: 0, length: 1 }, { index: 0, length: 0 })
  ).toEqual(true);
});

test('isInlineRangeEdge', () => {
  expect(isInlineRangeEdge(1, { index: 1, length: 0 })).toEqual(true);

  expect(isInlineRangeEdge(1, { index: 0, length: 1 })).toEqual(true);

  expect(isInlineRangeEdge(0, { index: 0, length: 0 })).toEqual(true);

  expect(isInlineRangeEdge(1, { index: 0, length: 0 })).toEqual(false);

  expect(isInlineRangeEdge(0, { index: 1, length: 0 })).toEqual(false);

  expect(isInlineRangeEdge(0, { index: 0, length: 1 })).toEqual(true);
});

test('isInlineRangeEdgeBefore', () => {
  expect(isInlineRangeEdgeBefore(1, { index: 1, length: 0 })).toEqual(true);

  expect(isInlineRangeEdgeBefore(1, { index: 0, length: 1 })).toEqual(false);

  expect(isInlineRangeEdgeBefore(0, { index: 0, length: 0 })).toEqual(true);

  expect(isInlineRangeEdgeBefore(1, { index: 0, length: 0 })).toEqual(false);

  expect(isInlineRangeEdgeBefore(0, { index: 1, length: 0 })).toEqual(false);

  expect(isInlineRangeEdgeBefore(0, { index: 0, length: 1 })).toEqual(true);
});

test('isInlineRangeEdgeAfter', () => {
  expect(isInlineRangeEdgeAfter(1, { index: 0, length: 1 })).toEqual(true);

  expect(isInlineRangeEdgeAfter(1, { index: 1, length: 0 })).toEqual(true);

  expect(isInlineRangeEdgeAfter(0, { index: 0, length: 0 })).toEqual(true);

  expect(isInlineRangeEdgeAfter(0, { index: 1, length: 0 })).toEqual(false);

  expect(isInlineRangeEdgeAfter(1, { index: 0, length: 0 })).toEqual(false);

  expect(isInlineRangeEdgeAfter(0, { index: 0, length: 1 })).toEqual(false);

  expect(isInlineRangeEdgeAfter(0, { index: 0, length: 0 })).toEqual(true);
});

test('isPoint', () => {
  expect(isPoint({ index: 1, length: 0 })).toEqual(true);

  expect(isPoint({ index: 0, length: 2 })).toEqual(false);

  expect(isPoint({ index: 0, length: 0 })).toEqual(true);

  expect(isPoint({ index: 2, length: 0 })).toEqual(true);

  expect(isPoint({ index: 2, length: 2 })).toEqual(false);
});

test('mergeInlineRange', () => {
  expect(
    mergeInlineRange({ index: 0, length: 0 }, { index: 1, length: 0 })
  ).toEqual({
    index: 0,
    length: 1,
  });

  expect(
    mergeInlineRange({ index: 0, length: 0 }, { index: 0, length: 0 })
  ).toEqual({
    index: 0,
    length: 0,
  });

  expect(
    mergeInlineRange({ index: 1, length: 0 }, { index: 2, length: 0 })
  ).toEqual({
    index: 1,
    length: 1,
  });

  expect(
    mergeInlineRange({ index: 2, length: 0 }, { index: 1, length: 0 })
  ).toEqual({
    index: 1,
    length: 1,
  });

  expect(
    mergeInlineRange({ index: 1, length: 3 }, { index: 2, length: 2 })
  ).toEqual({
    index: 1,
    length: 3,
  });

  expect(
    mergeInlineRange({ index: 2, length: 2 }, { index: 1, length: 1 })
  ).toEqual({
    index: 1,
    length: 3,
  });

  expect(
    mergeInlineRange({ index: 3, length: 2 }, { index: 2, length: 1 })
  ).toEqual({
    index: 2,
    length: 3,
  });

  expect(
    mergeInlineRange({ index: 0, length: 4 }, { index: 1, length: 1 })
  ).toEqual({
    index: 0,
    length: 4,
  });

  expect(
    mergeInlineRange({ index: 1, length: 1 }, { index: 0, length: 4 })
  ).toEqual({
    index: 0,
    length: 4,
  });

  expect(
    mergeInlineRange({ index: 0, length: 2 }, { index: 1, length: 3 })
  ).toEqual({
    index: 0,
    length: 4,
  });
});

test('intersectInlineRange', () => {
  expect(
    intersectInlineRange({ index: 0, length: 0 }, { index: 1, length: 0 })
  ).toEqual(null);

  expect(
    intersectInlineRange({ index: 0, length: 2 }, { index: 1, length: 1 })
  ).toEqual({ index: 1, length: 1 });

  expect(
    intersectInlineRange({ index: 0, length: 2 }, { index: 2, length: 0 })
  ).toEqual({ index: 2, length: 0 });

  expect(
    intersectInlineRange({ index: 1, length: 0 }, { index: 1, length: 0 })
  ).toEqual({ index: 1, length: 0 });

  expect(
    intersectInlineRange({ index: 1, length: 3 }, { index: 2, length: 2 })
  ).toEqual({ index: 2, length: 2 });

  expect(
    intersectInlineRange({ index: 1, length: 2 }, { index: 0, length: 3 })
  ).toEqual({ index: 1, length: 2 });

  expect(
    intersectInlineRange({ index: 1, length: 1 }, { index: 2, length: 2 })
  ).toEqual({ index: 2, length: 0 });

  expect(
    intersectInlineRange({ index: 2, length: 2 }, { index: 1, length: 3 })
  ).toEqual({ index: 2, length: 2 });

  expect(
    intersectInlineRange({ index: 2, length: 1 }, { index: 1, length: 1 })
  ).toEqual({ index: 2, length: 0 });

  expect(
    intersectInlineRange({ index: 0, length: 4 }, { index: 1, length: 2 })
  ).toEqual({ index: 1, length: 2 });
});
