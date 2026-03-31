import { describe, expect, test } from 'vitest';

import { getDefaultShareMode } from '../components/hooks/affine/use-share-url.utils';

describe('getDefaultShareMode', () => {
  test('returns edgeless when the current mode is edgeless', () => {
    expect(getDefaultShareMode('edgeless')).toBe('edgeless');
  });

  test('returns page for page mode or an unset mode', () => {
    expect(getDefaultShareMode('page')).toBe('page');
    expect(getDefaultShareMode(undefined)).toBe('page');
  });
});
