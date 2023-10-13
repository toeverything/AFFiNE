/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { Collection } from '@affine/env/filter';
import { renderHook } from '@testing-library/react';
import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import { BehaviorSubject } from 'rxjs';
import { expect, test } from 'vitest';

import { createDefaultFilter, vars } from '../filter/vars';
import {
  type CollectionsCRUDAtom,
  useCollectionManager,
} from '../use-collection-manager';

const defaultMeta = { tags: { options: [] } };
const collectionsSubject = new BehaviorSubject<Collection[]>([]);
const baseAtom = atomWithObservable<Collection[]>(
  () => {
    return collectionsSubject;
  },
  {
    initialValue: [],
  }
);

const mockAtom: CollectionsCRUDAtom = atom(get => {
  return {
    collections: get(baseAtom),
    addCollection: async (...collections) => {
      const prev = collectionsSubject.value;
      collectionsSubject.next([...collections, ...prev]);
    },
    deleteCollection: async (...ids) => {
      const prev = collectionsSubject.value;
      collectionsSubject.next(prev.filter(v => !ids.includes(v.id)));
    },
    updateCollection: async (id, updater) => {
      const prev = collectionsSubject.value;
      collectionsSubject.next(
        prev.map(v => {
          if (v.id === id) {
            return updater(v);
          }
          return v;
        })
      );
    },
  };
});

test('useAllPageSetting', async () => {
  const settingHook = renderHook(() => useCollectionManager(mockAtom));
  const prevCollection = settingHook.result.current.currentCollection;
  expect(settingHook.result.current.savedCollections).toEqual([]);
  await settingHook.result.current.updateCollection({
    ...settingHook.result.current.currentCollection,
    filterList: [createDefaultFilter(vars[0], defaultMeta)],
  });
  settingHook.rerender();
  const nextCollection = settingHook.result.current.currentCollection;
  expect(nextCollection).not.toBe(prevCollection);
  expect(nextCollection.filterList).toEqual([
    createDefaultFilter(vars[0], defaultMeta),
  ]);
  await settingHook.result.current.createCollection({
    ...settingHook.result.current.currentCollection,
    id: '1',
  });
  settingHook.rerender();
  expect(settingHook.result.current.savedCollections.length).toBe(1);
  expect(settingHook.result.current.savedCollections[0].id).toBe('1');
});
