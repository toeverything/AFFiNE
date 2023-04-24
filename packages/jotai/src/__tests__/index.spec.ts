/**
 * @vitest-environment happy-dom
 */
import { atomWithSyncStorage } from '@affine/jotai';
import { createStore } from 'jotai';
import { afterEach, describe, expect, test } from 'vitest';

afterEach(() => {
  localStorage.clear();
});

describe('atomWithSyncStorage', () => {
  test('basic', () => {
    const store = createStore();
    {
      [0, '0', false, null, undefined, NaN].forEach(value => {
        const atom = atomWithSyncStorage('test', value);
        expect(store.get(atom)).toBe(value);
      });
    }
  });
  test('mutate', () => {
    {
      const store = createStore();
      const atom = atomWithSyncStorage('test', 0);
      expect(store.get(atom)).toBe(0);
      store.set(atom, 1);
      expect(store.get(atom)).toBe(1);
    }
    {
      const store = createStore();
      const atom = atomWithSyncStorage('test', 0);
      expect(store.get(atom)).toBe(1);
    }
  });
});
