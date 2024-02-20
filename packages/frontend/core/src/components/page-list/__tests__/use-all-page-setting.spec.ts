/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { CollectionService } from '@affine/core/modules/collection';
import type { Collection } from '@affine/env/filter';
import { renderHook } from '@testing-library/react';
import { LiveData } from '@toeverything/infra';
import { BehaviorSubject } from 'rxjs';
import { expect, test } from 'vitest';

import { createDefaultFilter, vars } from '../filter/vars';
import { useCollectionManager } from '../use-collection-manager';

const defaultMeta = { tags: { options: [] } };
const collectionsSubject = new BehaviorSubject<Collection[]>([]);

const mockWorkspaceCollectionService = {
  collections: LiveData.from(collectionsSubject, []),
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
} as CollectionService;

test('useAllPageSetting', async () => {
  const settingHook = renderHook(() =>
    useCollectionManager(mockWorkspaceCollectionService)
  );
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
