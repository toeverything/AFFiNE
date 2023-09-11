/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { Collection } from '@affine/env/filter';
import { renderHook } from '@testing-library/react';
import { atom } from 'jotai';
import { expect, test } from 'vitest';

import { createDefaultFilter, vars } from '../filter/vars';
import {
  type CollectionsAtom,
  useCollectionManager,
} from '../use-collection-manager';

const defaultMeta = { tags: { options: [] } };

const baseAtom = atom<Collection[]>([]);

const mockAtom: CollectionsAtom = atom(
  get => get(baseAtom),
  async (get, set, update) => {
    set(baseAtom, update);
  }
);

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
