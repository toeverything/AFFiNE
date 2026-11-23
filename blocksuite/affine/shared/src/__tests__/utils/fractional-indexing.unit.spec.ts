import { expect, it } from 'vitest';

import { generateFractionalIndexingKeyBetween } from '../../utils/fractional-indexing.js';

it('keeps keys ordered when inserting right after the first key', () => {
  for (let i = 0; i < 100; i++) {
    const keys = [generateFractionalIndexingKeyBetween(null, null)];
    keys.unshift(generateFractionalIndexingKeyBetween(null, keys[0]));
    for (let j = 0; j < 50; j++) {
      const [a, b] = keys;
      const key = generateFractionalIndexingKeyBetween(a, b);
      expect(a < key && key < b, `${a} ${key} ${b}`).toBe(true);
      keys.splice(1, 0, key);
    }
  }
});
