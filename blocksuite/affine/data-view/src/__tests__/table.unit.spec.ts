import { describe, expect, test } from 'vitest';

import { numberFormats } from '../property-presets/number/utils/formats.js';
import {
  formatNumber,
  NumberFormatSchema,
  parseNumber,
} from '../property-presets/number/utils/formatter.js';
import { DEFAULT_COLUMN_WIDTH } from '../view-presets/table/consts.js';
import { mobileEffects } from '../view-presets/table/mobile/effect.js';
import type { MobileTableGroup } from '../view-presets/table/mobile/group.js';
import { pcEffects } from '../view-presets/table/pc/effect.js';
import type { TableGroup } from '../view-presets/table/pc/group.js';
import { materializeTableColumns } from '../view-presets/table/table-view-manager.js';

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

describe('table column materialization', () => {
  test('appends missing properties while preserving existing order and state', () => {
    const columns = [
      { id: 'status', width: 240, hide: true },
      { id: 'title', width: 320 },
    ];

    const next = materializeTableColumns(columns, ['title', 'status', 'date']);

    expect(next).toEqual([
      { id: 'status', width: 240, hide: true },
      { id: 'title', width: 320 },
      { id: 'date', width: DEFAULT_COLUMN_WIDTH },
    ]);
  });

  test('drops stale columns that no longer exist in data source', () => {
    const columns = [
      { id: 'title', width: 320 },
      { id: 'removed', width: 200, hide: true },
    ];

    const next = materializeTableColumns(columns, ['title']);

    expect(next).toEqual([{ id: 'title', width: 320 }]);
  });

  test('returns original reference when columns are already materialized', () => {
    const columns = [
      { id: 'title', width: 320 },
      { id: 'status', width: 240, hide: true },
    ];

    const next = materializeTableColumns(columns, ['title', 'status']);

    expect(next).toBe(columns);
  });

  test('supports type-aware default width when materializing missing columns', () => {
    const next = materializeTableColumns([], ['title', 'status'], id =>
      id === 'title' ? 260 : DEFAULT_COLUMN_WIDTH
    );

    expect(next).toEqual([
      { id: 'title', width: 260 },
      { id: 'status', width: DEFAULT_COLUMN_WIDTH },
    ]);
  });
});

describe('number formatter', () => {
  test('number format menu should expose all schema formats', () => {
    const menuFormats = numberFormats.map(format => format.type);
    const schemaFormats = NumberFormatSchema.options;

    expect(new Set(menuFormats)).toEqual(new Set(schemaFormats));
    expect(menuFormats).toHaveLength(schemaFormats.length);
  });

  test('formats grouped decimal numbers with Intl grouping rules', () => {
    const value = 11451.4;
    const decimals = 1;
    const expected = new Intl.NumberFormat(navigator.language, {
      style: 'decimal',
      useGrouping: true,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

    expect(formatNumber(value, 'numberWithCommas', decimals)).toBe(expected);
  });

  test('formats percent values with Intl percent rules', () => {
    const value = 0.1234;
    const decimals = 2;
    const expected = new Intl.NumberFormat(navigator.language, {
      style: 'percent',
      useGrouping: false,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

    expect(formatNumber(value, 'percent', decimals)).toBe(expected);
  });

  test('formats currency values with Intl currency rules', () => {
    const value = 11451.4;
    const expected = new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'symbol',
    }).format(value);

    expect(formatNumber(value, 'currencyUSD')).toBe(expected);
  });

  test('parses grouped number string pasted from clipboard', () => {
    expect(parseNumber('11,451.4')).toBe(11451.4);
  });

  test('keeps regular decimal parsing', () => {
    expect(parseNumber('123.45')).toBe(123.45);
  });

  test('supports comma as decimal separator in locale-specific input', () => {
    expect(parseNumber('11451,4', ',')).toBe(11451.4);
  });
});
