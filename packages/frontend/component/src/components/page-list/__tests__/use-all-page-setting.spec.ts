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
  type CollectionsCRUD,
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

const mockAtom = atom(get => {
  return {
    collections: get(baseAtom),
    addCollection: (...collections) => {
      const prev = collectionsSubject.value;
      collectionsSubject.next([...collections, ...prev]);
    },
    deleteCollection: (...ids) => {
      const prev = collectionsSubject.value;
      collectionsSubject.next(prev.filter(v => !ids.includes(v.id)));
    },
    updateCollection: (id, updater) => {
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
  } satisfies CollectionsCRUD;
});

test('useAllPageSetting', async () => {
  const settingHook = renderHook(() => useCollectionManager(mockAtom));
  const prevCollection = settingHook.result.current.currentCollection;
  expect(settingHook.result.current.savedCollections).toEqual([]);
  settingHook.result.current.updateCollection({
    ...settingHook.result.current.currentCollection,
    filterList: [createDefaultFilter(vars[0], defaultMeta)],
  });
  settingHook.rerender();
  const nextCollection = settingHook.result.current.currentCollection;
  expect(nextCollection).not.toBe(prevCollection);
  expect(nextCollection.filterList).toEqual([
    createDefaultFilter(vars[0], defaultMeta),
  ]);
  settingHook.result.current.createCollection({
    ...settingHook.result.current.currentCollection,
    id: '1',
  });
  settingHook.rerender();
  expect(settingHook.result.current.savedCollections.length).toBe(1);
  expect(settingHook.result.current.savedCollections[0].id).toBe('1');
});
