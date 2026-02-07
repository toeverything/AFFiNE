import { describe, expect, test } from 'vitest';

import { parseNumber } from '../property-presets/number/utils/formatter.js';
import { mobileEffects } from '../view-presets/table/mobile/effect.js';
import type { MobileTableGroup } from '../view-presets/table/mobile/group.js';
import { pcEffects } from '../view-presets/table/pc/effect.js';
import type { TableGroup } from '../view-presets/table/pc/group.js';

/** @vitest-environment happy-dom */

describe('TableGroup', () => {
  test('toggle collapse on pc', () => {
    pcEffects();
    const group = document.createElement(
      'affine-data-view-table-group'
    ) as TableGroup;

    expect(group.collapsed$.value).toBe(false);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(true);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(false);
  });

  test('toggle collapse on mobile', () => {
    mobileEffects();
    const group = document.createElement(
      'mobile-table-group'
    ) as MobileTableGroup;

    expect(group.collapsed$.value).toBe(false);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(true);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(false);
  });
});

describe('number formatter', () => {
  test('parses grouped number string pasted from clipboard', () => {
    expect(parseNumber('14,901.5')).toBe(14901.5);
  });

  test('keeps regular decimal parsing', () => {
    expect(parseNumber('123.45')).toBe(123.45);
  });

  test('supports comma as decimal separator in locale-specific input', () => {
    expect(parseNumber('14901,5', ',')).toBe(14901.5);
  });
});
