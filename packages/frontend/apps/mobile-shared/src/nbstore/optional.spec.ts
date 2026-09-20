import { describe, expect, it } from 'vitest';

import { normalizeNativeOptional } from './optional';

describe('normalizeNativeOptional', () => {
  it.each([
    ['string', 'summary', 'summary'],
    ['null', null, null],
    ['missing key', undefined, null],
    ['wrong type', 42, 42],
  ])('normalizes %s', (_, input, expected) => {
    expect(normalizeNativeOptional(input)).toBe(expected);
  });
});
