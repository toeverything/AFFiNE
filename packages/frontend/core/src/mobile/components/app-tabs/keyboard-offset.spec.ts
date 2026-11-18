import { describe, expect, test } from 'vitest';

import { computeAppTabsBottomOffset } from './keyboard-offset';

describe('computeAppTabsBottomOffset', () => {
  test('returns undefined when there is no keyboard height, letting the stylesheet resting value apply unmodified', () => {
    expect(computeAppTabsBottomOffset(0)).toBeUndefined();
  });

  test('returns the negative offset accounting for the keyboard height, matching the -2px resting value', () => {
    expect(computeAppTabsBottomOffset(300)).toBe('-302px');
  });
});
