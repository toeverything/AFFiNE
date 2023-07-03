/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';

import { createDefaultFilter, vars } from '../filter/vars';
import { useCollectionManager } from '../use-collection-manager';

const defaultMeta = { tags: { options: [] } };

test('useAllPageSetting', async () => {
  const settingHook = renderHook(() => useCollectionManager());
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
  settingHook.result.current.backToAll();
  await settingHook.result.current.saveCollection({
    ...settingHook.result.current.currentCollection,
    id: '1',
  });
  settingHook.rerender();
  expect(settingHook.result.current.savedCollections.length).toBe(1);
  expect(settingHook.result.current.savedCollections[0].id).toBe('1');
});
