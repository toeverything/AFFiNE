import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  EDGELESS_SHORTCUT_STORAGE_KEY,
  getEdgelessToolShortcut,
  resetEdgelessToolShortcut,
  resetEdgelessToolShortcuts,
  setEdgelessToolShortcut,
  subscribeEdgelessToolShortcuts,
} from '../utils/shortcut-settings.js';

describe('edgeless tool shortcut settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEdgelessToolShortcuts();
  });

  test('persists a shortcut override and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEdgelessToolShortcuts(listener);

    expect(setEdgelessToolShortcut('pen', 'Q')).toBeNull();
    expect(getEdgelessToolShortcut('pen')).toBe('q');
    expect(
      JSON.parse(localStorage.getItem(EDGELESS_SHORTCUT_STORAGE_KEY) ?? '{}')
    ).toEqual({ pen: 'q' });
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
  });

  test('rejects conflicts with another tool shortcut', () => {
    expect(setEdgelessToolShortcut('pen', 'v')).toBe('select');
    expect(getEdgelessToolShortcut('pen')).toBe('p');
  });

  test('rejects shortcuts reserved by fixed edgeless tools', () => {
    expect(setEdgelessToolShortcut('pen', 's')).toBe('reserved');
    expect(setEdgelessToolShortcut('pen', 'k')).toBe('reserved');
    expect(getEdgelessToolShortcut('pen')).toBe('p');
  });

  test('rejects shortcuts that are not a single letter or number', () => {
    expect(() => setEdgelessToolShortcut('pen', 'Ctrl-P')).toThrow();
    expect(() => setEdgelessToolShortcut('pen', 'Shift')).toThrow();
  });

  test('removes an override when reset', () => {
    setEdgelessToolShortcut('pen', 'q');
    resetEdgelessToolShortcut('pen');

    expect(getEdgelessToolShortcut('pen')).toBe('p');
    expect(localStorage.getItem(EDGELESS_SHORTCUT_STORAGE_KEY)).toBeNull();
  });

  test('does not reset to a shortcut currently used by another tool', () => {
    setEdgelessToolShortcut('pen', 'q');
    setEdgelessToolShortcut('select', 'p');

    expect(resetEdgelessToolShortcut('pen')).toBe('select');
    expect(getEdgelessToolShortcut('pen')).toBe('q');
  });
});
