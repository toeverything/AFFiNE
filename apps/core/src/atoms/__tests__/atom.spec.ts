/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { createStore } from 'jotai';
import { describe, expect, test } from 'vitest';

import {
  pageSettingFamily,
  pageSettingsAtom,
  recentPageIdsBaseAtom,
} from '../index';

describe('page mode atom', () => {
  test('basic', () => {
    const store = createStore();
    const page0SettingAtom = pageSettingFamily('page0');
    store.set(page0SettingAtom, {
      mode: 'page',
    });

    expect(store.get(pageSettingsAtom)).toEqual({
      page0: {
        mode: 'page',
      },
    });

    expect(store.get(recentPageIdsBaseAtom)).toEqual(['page0']);

    const page1SettingAtom = pageSettingFamily('page1');
    store.set(page1SettingAtom, {
      mode: 'edgeless',
    });
    expect(store.get(recentPageIdsBaseAtom)).toEqual(['page1', 'page0']);
  });
});
