/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { Collection } from '@affine/env/filter';
import { renderHook } from '@testing-library/react';
import { noop } from 'foxact/noop';
import { atom } from 'jotai';
import { expect, test } from 'vitest';

import { createDefaultFilter, vars } from '../filter/vars';
import {
  type StorageCRUD,
  useCollectionManager,
} from '../use-collection-manager';

const defaultMeta = { tags: { options: [] } };

const storage: Collection[] = [];

const mockStorage: StorageCRUD<Collection> = {
  get: async (key: string) => {
    return storage.find(v => v.id === key) ?? null;
  },
  set: async (key: string, value: Collection) => {
    storage.push(value);
    return key;
  },
  delete: async (key: string) => {
    const index = storage.findIndex(v => v.id === key);
    if (index >= 0) {
      storage.splice(index, 1);
    }
  },
  list: async () => {
    return storage.map(v => v.id);
  },
  on: () => noop,
};

const mockAtom = atom(mockStorage);

test('useAllPageSetting', async () => {
  const settingHook = renderHook(() => useCollectionManager(mockAtom));
  const prevCollection = settingHook.result.current.currentCollection;
  expect(settingHook.result.current.savedCollections).toEqual([]);
  await settingHook.result.current.updateCollection({
    ...settingHook.result.current.currentCollection,
    filterList: [createDefaultFilter(vars[0], defaultMeta)],
    workspaceId: 'test',
  });
  settingHook.rerender();
  const nextCollection = settingHook.result.current.currentCollection;
  expect(nextCollection).not.toBe(prevCollection);
  expect(nextCollection.filterList).toEqual([
    createDefaultFilter(vars[0], defaultMeta),
  ]);
  settingHook.result.current.backToAll();
  await settingHook.result.current.saveCollection({
    ...settingHook.result.current.currentCollection,
    id: '1',
  });
  settingHook.rerender();
  expect(settingHook.result.current.savedCollections.length).toBe(1);
  expect(settingHook.result.current.savedCollections[0].id).toBe('1');
});
