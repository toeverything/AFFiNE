/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { assertExists } from '@blocksuite/global/utils';
import { renderHook } from '@testing-library/react';
import { RESET } from 'jotai/utils';
import { describe,expect, test } from 'vitest';

import type {
  Filter,
  FilterMatcherDataType,
  LiteralValue,
  Ref,
  VariableMap,
} from '../filter/vars';
import {
  createDefaultFilter,
  filterMatcher,
  toLiteral,
  vars,
} from '../filter/vars';
import { filterByFilterList, useAllPageSetting } from '../use-all-page-setting';

test('useAllPageSetting', async () => {
  const settingHook = renderHook(() => useAllPageSetting());
  const prevView = settingHook.result.current.currentView;
  expect(settingHook.result.current.savedViews).toEqual([]);
  settingHook.result.current.setCurrentView(view => ({
    ...view,
    filterList: [createDefaultFilter(vars[0])],
  }));
  settingHook.rerender();
  const nextView = settingHook.result.current.currentView;
  expect(nextView).not.toBe(prevView);
  expect(nextView.filterList).toEqual([createDefaultFilter(vars[0])]);
  settingHook.result.current.setCurrentView(RESET);
  await settingHook.result.current.createView({
    ...settingHook.result.current.currentView,
    id: '1',
  });
  settingHook.rerender();
  expect(settingHook.result.current.savedViews.length).toBe(1);
  expect(settingHook.result.current.savedViews[0].id).toBe('1');
});

describe('filter test', () => {
  const ref = (name: keyof VariableMap): Ref => {
    return {
      type: 'ref',
      name,
    };
  };
  const mockVariableMap = (vars: Partial<VariableMap>): VariableMap => {
    return {
      Created: 0,
      Updated: 0,
      Favorite: false,
      ...vars,
    };
  };
  const filter = (
    matcherData: FilterMatcherDataType,
    left: Ref,
    args: LiteralValue[]
  ): Filter => {
    return {
      type: 'filter',
      left,
      funcName: matcherData.name,
      args: args.map(toLiteral),
    };
  };
  test('before', async () => {
    const before = filterMatcher.findData(v => v.name === 'before');
    assertExists(before);
    const filter1 = filter(before, ref('Created'), [
      new Date(2023, 5, 28).getTime(),
    ]);
    const filter2 = filter(before, ref('Created'), [
      new Date(2023, 5, 30).getTime(),
    ]);
    const filter3 = filter(before, ref('Created'), [
      new Date(2023, 5, 29).getTime(),
    ]);
    const varMap = mockVariableMap({
      Created: new Date(2023, 5, 29).getTime(),
    });
    expect(filterByFilterList([filter1], varMap)).toBe(false);
    expect(filterByFilterList([filter2], varMap)).toBe(true);
    expect(filterByFilterList([filter3], varMap)).toBe(false);
  });
  test('after', async () => {
    const after = filterMatcher.findData(v => v.name === 'after');
    assertExists(after);
    const filter1 = filter(after, ref('Created'), [
      new Date(2023, 5, 28).getTime(),
    ]);
    const filter2 = filter(after, ref('Created'), [
      new Date(2023, 5, 30).getTime(),
    ]);
    const filter3 = filter(after, ref('Created'), [
      new Date(2023, 5, 29).getTime(),
    ]);
    const varMap = mockVariableMap({
      Created: new Date(2023, 5, 29).getTime(),
    });
    expect(filterByFilterList([filter1], varMap)).toBe(true);
    expect(filterByFilterList([filter2], varMap)).toBe(false);
    expect(filterByFilterList([filter3], varMap)).toBe(false);
  });
  test('is', async () => {
    const is = filterMatcher.findData(v => v.name === 'is');
    assertExists(is);
    const filter1 = filter(is, ref('Favorite'), [false]);
    const filter2 = filter(is, ref('Favorite'), [true]);
    const varMap = mockVariableMap({
      Favorite: true,
    });
    expect(filterByFilterList([filter1], varMap)).toBe(false);
    expect(filterByFilterList([filter2], varMap)).toBe(true);
  });
});
