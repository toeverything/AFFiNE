import { describe, expect, test } from 'vitest';

import {
  consumeKeyboardToolbarClick,
  rememberKeyboardToolbarActivation,
} from '../../../../widgets/keyboard-toolbar/src/utils.js';

describe('keyboard toolbar click suppression', () => {
  test('allows ordinary click activation when nothing was pre-handled', () => {
    const state = { suppressNextClick: false };

    expect(consumeKeyboardToolbarClick(state)).toBe(true);
  });

  test('suppresses only the first click after a handled activation', () => {
    const state = { suppressNextClick: false };

    rememberKeyboardToolbarActivation(state);

    expect(consumeKeyboardToolbarClick(state)).toBe(false);
    expect(consumeKeyboardToolbarClick(state)).toBe(true);
  });
});
