import { expect, test } from 'vitest';

import { generateFractionalIndexingKeyBetween } from '../fractional-indexing';

function gen(a: string | null, b: string | null) {
  const result = generateFractionalIndexingKeyBetween(a, b);

  expect(
    a === null || b === null || (a < result && result < b),
    `${a} ${b} ${result}`
  ).toBe(true);
  return result;
}

test('fractional-indexing', () => {
  for (let i = 0; i < 100; i++) {
    const set = new Set<string>();
    let a = null;
    let b = null;
    for (let i = 0; i < 100; i++) {
      const s1 = gen(a, b);
      expect(a === null || b === null || (a < s1 && s1 < b)).toBe(true);
      const s2 = gen(a, b);
      expect(a === null || b === null || (a < s2 && s2 < b)).toBe(true);

      if (set.has(s1) || set.has(s2) || s1 === s2) {
        throw new Error('Duplicate key, ' + set.size + ', ' + s1 + ', ' + s2);
        break;
      }
      set.add(s1);
      set.add(s2);
      if (s1 < s2) {
        a = s1;
        b = s2;
      } else {
        a = s2;
        b = s1;
      }
    }
  }
});

test('no postfix', () => {
  expect(
    generateFractionalIndexingKeyBetween('a0', null).startsWith('a1')
  ).toBe(true);
  expect(
    generateFractionalIndexingKeyBetween('a01', null).startsWith('a1')
  ).toBe(true);
  expect(
    generateFractionalIndexingKeyBetween('a0001', null).startsWith('a1')
  ).toBe(true);
  expect(
    generateFractionalIndexingKeyBetween(null, 'a0').startsWith('Zz')
  ).toBe(true);
  expect(
    generateFractionalIndexingKeyBetween('a0', 'a01').startsWith('a00V')
  ).toBe(true);
});
