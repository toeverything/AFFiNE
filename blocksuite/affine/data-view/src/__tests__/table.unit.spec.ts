import { describe, expect, test } from 'vitest';

import type { FilterGroup } from '../core/filter/types.js';
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
import {
  materializeTableColumns,
  TableSingleView,
} from '../view-presets/table/table-view-manager.js';
import {
  applyHierarchyMutation,
  calculateHierarchyIndent,
  computeIndentMutation,
  computeUnindentMutation,
  normalizeHierarchyLevel,
} from '../view-presets/table/utils.js';

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

describe('table filtering', () => {
  test('evaluates filters with hidden columns', () => {
    const filter: FilterGroup = {
      type: 'group',
      op: 'and',
      conditions: [
        {
          type: 'filter',
          left: {
            type: 'ref',
            name: 'status',
          },
          function: 'is',
          args: [{ type: 'literal', value: 'Done' }],
        },
      ],
    };

    const titleProperty = {
      id: 'title',
      cellGetOrCreate: () => ({
        jsonValue$: {
          value: 'Task 1',
        },
      }),
    };
    const statusProperty = {
      id: 'status',
      cellGetOrCreate: () => ({
        jsonValue$: {
          value: 'Done',
        },
      }),
    };

    const view = {
      filter$: { value: filter },
      // Simulate status being hidden in current view.
      properties$: { value: [titleProperty] },
      propertiesRaw$: { value: [titleProperty, statusProperty] },
    } as unknown as TableSingleView;

    expect(TableSingleView.prototype.isShow.call(view, 'row-1')).toBe(true);
  });

  test('returns false when hidden filtered column does not match', () => {
    const filter: FilterGroup = {
      type: 'group',
      op: 'and',
      conditions: [
        {
          type: 'filter',
          left: {
            type: 'ref',
            name: 'status',
          },
          function: 'is',
          args: [{ type: 'literal', value: 'Done' }],
        },
      ],
    };

    const titleProperty = {
      id: 'title',
      cellGetOrCreate: () => ({
        jsonValue$: {
          value: 'Task 1',
        },
      }),
    };
    const statusProperty = {
      id: 'status',
      cellGetOrCreate: () => ({
        jsonValue$: {
          value: 'In Progress',
        },
      }),
    };

    const view = {
      filter$: { value: filter },
      // Simulate status being hidden in current view.
      properties$: { value: [titleProperty] },
      propertiesRaw$: { value: [titleProperty, statusProperty] },
    } as unknown as TableSingleView;

    expect(TableSingleView.prototype.isShow.call(view, 'row-1')).toBe(false);
  });
});

describe('journal todo "done date" filter semantics', () => {
  // Mirrors the OR(isNotOneOf(done), after(referenceCreatedAt-1)) filter
  // built by `journalTodoDatabaseSlashMenuConfig` (Story 2.4/Done-date
  // follow-up) — a task done *after this specific reference was inserted*
  // stays visible in it; a task done before the reference existed is
  // filtered out. Deliberately based on real wall-clock reference-creation
  // time, not the journal's own (possibly future- or past-dated) date —
  // see the slash-menu config's own comment for why.
  const referenceCreatedAt = new Date('2026-07-29T00:00:00').getTime();

  function makeFilter(): FilterGroup {
    return {
      type: 'group',
      op: 'or',
      conditions: [
        {
          type: 'filter',
          left: { type: 'ref', name: 'status' },
          function: 'isNotOneOf',
          args: [{ type: 'literal', value: ['done'] }],
        },
        {
          type: 'filter',
          left: { type: 'ref', name: 'doneDate' },
          function: 'after',
          args: [{ type: 'literal', value: referenceCreatedAt - 1 }],
        },
      ],
    };
  }

  function makeView(statusValue: unknown, doneDateValue: unknown) {
    const statusProperty = {
      id: 'status',
      cellGetOrCreate: () => ({ jsonValue$: { value: statusValue } }),
    };
    const doneDateProperty = {
      id: 'doneDate',
      cellGetOrCreate: () => ({ jsonValue$: { value: doneDateValue } }),
    };
    return {
      filter$: { value: makeFilter() },
      properties$: { value: [statusProperty, doneDateProperty] },
      propertiesRaw$: { value: [statusProperty, doneDateProperty] },
    } as unknown as TableSingleView;
  }

  test('a not-done row stays visible regardless of Done date', () => {
    const view = makeView('not_done', null);
    expect(TableSingleView.prototype.isShow.call(view, 'row-1')).toBe(true);
  });

  test('a row done after this reference was created stays visible', () => {
    const doneAfter = referenceCreatedAt + 60 * 60 * 1000;
    const view = makeView('done', doneAfter);
    expect(TableSingleView.prototype.isShow.call(view, 'row-1')).toBe(true);
  });

  test('a row done before this reference was created is filtered out', () => {
    const doneBefore = referenceCreatedAt - 60 * 60 * 1000;
    const view = makeView('done', doneBefore);
    expect(TableSingleView.prototype.isShow.call(view, 'row-1')).toBe(false);
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

describe('table hierarchy helpers', () => {
  test('normalizes hierarchy level from number and string values', () => {
    expect(normalizeHierarchyLevel(3)).toBe(3);
    expect(normalizeHierarchyLevel('2')).toBe(2);
    expect(normalizeHierarchyLevel(-1)).toBe(0);
    expect(normalizeHierarchyLevel('not-a-number')).toBe(0);
  });

  test('calculates bounded indentation by hierarchy level', () => {
    expect(calculateHierarchyIndent(0)).toBe(0);
    expect(calculateHierarchyIndent(1)).toBe(12);
    expect(calculateHierarchyIndent(3)).toBe(36);
    expect(calculateHierarchyIndent(100)).toBe(96);
  });

  test('indents and unindents row hierarchy metadata', () => {
    const values = new Map<string, Map<string, unknown>>();
    const setCell = (rowId: string, propertyId: string, value: unknown) => {
      if (!values.has(rowId)) values.set(rowId, new Map());
      values.get(rowId)?.set(propertyId, value);
    };
    const getCell = (rowId: string, propertyId: string) =>
      values.get(rowId)?.get(propertyId);

    const levelProp = {
      id: 'level',
      name$: { value: 'Hierarchy Level' },
      valueSetFromString: (rowId: string, value: string) =>
        setCell(rowId, 'level', Number(value)),
      cellGetOrCreate: (rowId: string) => ({
        jsonValue$: { value: getCell(rowId, 'level') ?? 0 },
      }),
    };
    const parentProp = {
      id: 'parent',
      name$: { value: 'Parent Identifier' },
      valueSetFromString: (rowId: string, value: string) =>
        setCell(rowId, 'parent', value),
      cellGetOrCreate: (rowId: string) => ({
        jsonValue$: { value: getCell(rowId, 'parent') ?? '' },
      }),
    };
    const ancestorProp = {
      id: 'ancestors',
      name$: { value: 'Ancestor Identifiers' },
      valueSetFromString: (rowId: string, value: string) =>
        setCell(rowId, 'ancestors', value),
      cellGetOrCreate: (rowId: string) => ({
        jsonValue$: { value: getCell(rowId, 'ancestors') ?? '' },
      }),
    };

    const rowIds = ['a', 'b', 'c'];
    setCell('a', 'level', 0);
    setCell('b', 'level', 0);
    setCell('c', 'level', 1);

    const context = {
      rowIds,
      rowId: 'b',
      docId: 'doc',
      properties: [levelProp, parentProp, ancestorProp],
    };

    const indentResult = computeIndentMutation(context);
    applyHierarchyMutation(context, indentResult);

    expect(getCell('b', 'level')).toBe(1);

    const unindentResult = computeUnindentMutation(context);
    expect(unindentResult).not.toBeNull();
    expect(getCell('b', 'level')).toBe(0);
  });
});
