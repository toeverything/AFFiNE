/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';

import { useAllPageSetting } from '../use-all-page-setting';

test('useAllPageSetting', () => {
  const settingHook = renderHook(() => useAllPageSetting());
  const prevView = settingHook.result.current.currentView;
  expect(settingHook.result.current.savedViews).toEqual([]);
  settingHook.result.current.setCurrentView(view => ({
    ...view,
    filterList: [
      {
        type: 'filter',
        left: {
          type: 'ref',
          name: 'Created',
        },
        funcName: 'Create',
        args: [],
      },
    ],
  }));
  settingHook.rerender();
  const nextView = settingHook.result.current.currentView;
  expect(nextView).not.toBe(prevView);
  expect(nextView.filterList).toEqual([
    {
      type: 'filter',
      left: {
        type: 'ref',
        name: 'Created',
      },
      funcName: 'Create',
      args: [],
    },
  ]);
});
