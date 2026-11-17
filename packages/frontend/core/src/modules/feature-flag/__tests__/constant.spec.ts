import { describe, expect, test } from 'vitest';

import { AFFINE_FLAGS } from '../constant';

describe('feature-flag constant', () => {
  test('enable_mobile_database_editing defaults to on for mobile', () => {
    expect(AFFINE_FLAGS.enable_mobile_database_editing.defaultState).toBe(true);
    expect(AFFINE_FLAGS.enable_mobile_database_editing.category).toBe(
      'blocksuite'
    );
  });
});
