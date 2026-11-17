/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { shouldSuppressMiddleClickPaste } from '../blocksuite-editor';

describe('shouldSuppressMiddleClickPaste', () => {
  it('suppresses native middle-click paste on Linux when the setting is off (the default)', () => {
    // Regression: a refactor once deleted this whole condition, leaving
    // native middle-click paste permanently on regardless of the setting.
    expect(shouldSuppressMiddleClickPaste(false, true, 1)).toBe(true);
  });

  it('does not suppress it when the user has opted in via settings', () => {
    expect(shouldSuppressMiddleClickPaste(true, true, 1)).toBe(false);
  });

  it('does not suppress it on non-Linux platforms', () => {
    expect(shouldSuppressMiddleClickPaste(false, false, 1)).toBe(false);
  });

  it('does not suppress clicks other than the middle button', () => {
    expect(shouldSuppressMiddleClickPaste(false, true, 0)).toBe(false);
    expect(shouldSuppressMiddleClickPaste(false, true, 2)).toBe(false);
  });
});
