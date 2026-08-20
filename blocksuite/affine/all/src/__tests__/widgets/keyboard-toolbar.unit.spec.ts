import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  clearKeyboardToolbarActivation,
  consumeKeyboardToolbarClick,
  expireKeyboardToolbarActivation,
  rememberKeyboardToolbarActivation,
} from '../../../../widgets/keyboard-toolbar/src/utils.js';

describe('keyboard toolbar click suppression', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  test('can clear stale suppression when the matching click never arrives', () => {
    const state = { suppressNextClick: false };

    rememberKeyboardToolbarActivation(state);
    clearKeyboardToolbarActivation(state);

    expect(consumeKeyboardToolbarClick(state)).toBe(true);
  });

  test('does not expire suppression before pointer or key activation ends', () => {
    vi.useFakeTimers();
    const state = { suppressNextClick: false };

    rememberKeyboardToolbarActivation(state);
    vi.advanceTimersByTime(550);

    expect(consumeKeyboardToolbarClick(state)).toBe(false);
  });

  test('starts stale suppression timeout after activation ends', () => {
    vi.useFakeTimers();
    const state = { suppressNextClick: false };

    rememberKeyboardToolbarActivation(state);
    expireKeyboardToolbarActivation(state);
    vi.advanceTimersByTime(550);

    expect(consumeKeyboardToolbarClick(state)).toBe(true);
  });
});
