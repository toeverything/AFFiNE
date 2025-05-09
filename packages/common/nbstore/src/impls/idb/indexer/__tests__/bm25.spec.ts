import { expect, test } from 'vitest';

import { bm25 } from '../bm25';

test('bm25', () => {
  expect(bm25(1, 1, 10, 10, 15)).toEqual(3.2792079793859643);
  expect(bm25(2, 1, 10, 10, 15) > bm25(1, 1, 10, 10, 15)).toBeTruthy();
  expect(bm25(1, 1, 10, 10, 15) > bm25(2, 1, 10, 100, 15)).toBeTruthy();
  expect(bm25(1, 1, 10, 10, 15) > bm25(1, 1, 10, 100, 15)).toBeTruthy();
});
