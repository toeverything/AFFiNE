import { getDefaultStore } from 'jotai';
import { describe, expect, test } from 'vitest';

import { currentAffineUserAtom } from '../atom';

describe('atom', () => {
  test('currentAffineUserAtom', () => {
    const store = getDefaultStore();
    const mock = {
      created_at: 0,
      exp: 0,
      email: '',
      id: '',
      name: '',
      avatar_url: '',
    };
    store.set(currentAffineUserAtom, mock);
    expect(store.get(currentAffineUserAtom)).toEqual(mock);
  });
});
