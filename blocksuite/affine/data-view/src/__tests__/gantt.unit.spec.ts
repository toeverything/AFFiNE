import { describe, expect, it } from 'vitest';

import {
  DAY_WIDTH_BY_SCALE,
  nextZoomScale,
  pickFitScale,
  SCALE_ORDER,
} from '../view-presets/gantt/pc/gantt-view-ui-logic.js';
import { calendarDaysBetween } from '../view-presets/gantt/pc/utils.js';

describe('calendarDaysBetween', () => {
  it('returns 0 for the same date', () => {
    const d = new Date(2025, 5, 15);
    expect(calendarDaysBetween(d, d)).toBe(0);
  });

  it('returns positive for b after a', () => {
    const a = new Date(2025, 0, 1);
    const b = new Date(2025, 0, 10);
    expect(calendarDaysBetween(a, b)).toBe(9);
  });

  it('returns negative for b before a', () => {
    const a = new Date(2025, 0, 10);
    const b = new Date(2025, 0, 1);
    expect(calendarDaysBetween(a, b)).toBe(-9);
  });

  it('handles month boundaries', () => {
    const a = new Date(2025, 0, 31); // Jan 31
    const b = new Date(2025, 1, 1); // Feb 1
    expect(calendarDaysBetween(a, b)).toBe(1);
  });

  it('handles year boundaries', () => {
    const a = new Date(2024, 11, 31); // Dec 31
    const b = new Date(2025, 0, 1); // Jan 1
    expect(calendarDaysBetween(a, b)).toBe(1);
  });

  it('handles leap year Feb 29', () => {
    const a = new Date(2024, 1, 28); // Feb 28 leap year
    const b = new Date(2024, 2, 1); // Mar 1
    expect(calendarDaysBetween(a, b)).toBe(2); // 28 -> 29 -> 1
  });

  it('handles non-leap year Feb', () => {
    const a = new Date(2025, 1, 28); // Feb 28 non-leap
    const b = new Date(2025, 2, 1); // Mar 1
    expect(calendarDaysBetween(a, b)).toBe(1);
  });

  it('ignores time-of-day differences', () => {
    const a = new Date(2025, 5, 15, 23, 59, 59);
    const b = new Date(2025, 5, 16, 0, 0, 1);
    expect(calendarDaysBetween(a, b)).toBe(1);
  });

  // Note: These DST tests run under TZ=Asia/Singapore (no DST).
  // The implementation is DST-safe by design: calendarDaysBetween extracts
  // Y/M/D then uses Date.UTC, so local-time DST shifts cannot affect it.
  // These tests verify the math is correct but don't exercise DST edge cases at runtime.
  it('returns integer even across DST transitions', () => {
    // US spring forward: March 9, 2025
    const a = new Date(2025, 2, 8);
    const b = new Date(2025, 2, 10);
    const result = calendarDaysBetween(a, b);
    expect(result).toBe(2);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('returns integer across fall-back DST', () => {
    // US fall back: November 2, 2025
    const a = new Date(2025, 10, 1);
    const b = new Date(2025, 10, 3);
    const result = calendarDaysBetween(a, b);
    expect(result).toBe(2);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('handles large date ranges', () => {
    const a = new Date(2020, 0, 1);
    const b = new Date(2025, 0, 1);
    // 2020 is leap, 2024 is leap => 5 * 365 + 2 = 1827
    expect(calendarDaysBetween(a, b)).toBe(1827);
  });
});

describe('materializeGanttColumns', () => {
  // Test the column materialization logic extracted from gantt-view-manager
  // This mirrors the table/kanban materialize tests

  const materializeColumnsByPropertyIds = (
    columns: { id: string; hide?: boolean }[],
    propertyIds: string[]
  ) => {
    const needShow = new Set(propertyIds);
    const orderedColumns: { id: string; hide?: boolean }[] = [];

    for (const column of columns) {
      if (needShow.has(column.id)) {
        orderedColumns.push(column);
        needShow.delete(column.id);
      }
    }

    for (const id of needShow) {
      orderedColumns.push({ id });
    }

    return orderedColumns;
  };

  const materializeGanttColumns = (
    columns: { id: string; hide?: boolean }[],
    propertyIds: string[]
  ) => {
    const nextColumns = materializeColumnsByPropertyIds(columns, propertyIds);
    const unchanged =
      columns.length === nextColumns.length &&
      columns.every((column, index) => {
        const nextColumn = nextColumns[index];
        return (
          nextColumn != null &&
          column.id === nextColumn.id &&
          column.hide === nextColumn.hide
        );
      });

    return unchanged ? columns : nextColumns;
  };

  it('preserves order when columns match properties', () => {
    const columns = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = materializeGanttColumns(columns, ['a', 'b', 'c']);
    expect(result).toBe(columns); // same reference = unchanged
  });

  it('appends missing properties', () => {
    const columns = [{ id: 'a' }];
    const result = materializeGanttColumns(columns, ['a', 'b', 'c']);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(result).not.toBe(columns);
  });

  it('drops stale columns not in properties', () => {
    const columns = [{ id: 'a' }, { id: 'deleted' }, { id: 'b' }];
    const result = materializeGanttColumns(columns, ['a', 'b']);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('preserves hide flag', () => {
    const columns = [
      { id: 'a', hide: true },
      { id: 'b', hide: false },
    ];
    const result = materializeGanttColumns(columns, ['a', 'b']);
    expect(result).toBe(columns); // same reference, unchanged
    expect(result[0]?.hide).toBe(true);
  });

  it('returns same reference when already materialized', () => {
    const columns = [{ id: 'x' }, { id: 'y' }];
    const result = materializeGanttColumns(columns, ['x', 'y']);
    expect(result).toBe(columns);
  });

  it('handles empty columns', () => {
    const columns: { id: string }[] = [];
    const result = materializeGanttColumns(columns, ['a', 'b']);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('handles empty properties', () => {
    const columns = [{ id: 'a' }];
    const result = materializeGanttColumns(columns, []);
    expect(result).toEqual([]);
  });
});

describe('SCALE_ORDER and DAY_WIDTH_BY_SCALE', () => {
  it('SCALE_ORDER has three entries in coarsest-to-finest order', () => {
    expect(SCALE_ORDER).toEqual(['month', 'week', 'day']);
  });

  it('DAY_WIDTH_BY_SCALE increases with finer scales', () => {
    expect(DAY_WIDTH_BY_SCALE.month).toBeLessThan(DAY_WIDTH_BY_SCALE.week);
    expect(DAY_WIDTH_BY_SCALE.week).toBeLessThan(DAY_WIDTH_BY_SCALE.day);
  });

  it('DAY_WIDTH_BY_SCALE has correct values', () => {
    expect(DAY_WIDTH_BY_SCALE).toEqual({ day: 40, week: 16, month: 6 });
  });
});

describe('nextZoomScale', () => {
  it('zooming in from month returns week', () => {
    expect(nextZoomScale('month', 'in')).toBe('week');
  });

  it('zooming in from week returns day', () => {
    expect(nextZoomScale('week', 'in')).toBe('day');
  });

  it('zooming in from day returns null (already finest)', () => {
    expect(nextZoomScale('day', 'in')).toBeNull();
  });

  it('zooming out from day returns week', () => {
    expect(nextZoomScale('day', 'out')).toBe('week');
  });

  it('zooming out from week returns month', () => {
    expect(nextZoomScale('week', 'out')).toBe('month');
  });

  it('zooming out from month returns null (already coarsest)', () => {
    expect(nextZoomScale('month', 'out')).toBeNull();
  });
});

describe('pickFitScale', () => {
  it('picks day scale when few days fit in viewport', () => {
    // 10 days: month=60, week=160, day=400 — day is closest to 800
    expect(pickFitScale(10, 800)).toBe('day');
  });

  it('picks week when it is closest to viewport width', () => {
    // 50 days: month=300, week=800, day=2000 — week is exact match
    expect(pickFitScale(50, 800)).toBe('week');
  });

  it('picks month when it is closest to viewport width', () => {
    // 150 days: month=900, week=2400, day=6000 — month closest to 800
    expect(pickFitScale(150, 800)).toBe('month');
  });

  it('picks scale closest to viewport even if nothing fits exactly', () => {
    // 30 days: month=180, week=480, day=1200
    // diffs: month=620, week=320, day=400 → week closest
    expect(pickFitScale(30, 800)).toBe('week');
  });

  it('picks day when all scales are smaller than viewport', () => {
    // 5 days: month=30, week=80, day=200
    // diffs from 800: month=770, week=720, day=600 → day closest
    expect(pickFitScale(5, 800)).toBe('day');
  });

  it('picks month for very large date ranges', () => {
    // 1000 days: month=6000, week=16000, day=40000
    // diffs from 800: month=5200, week=15200, day=39200 → month
    expect(pickFitScale(1000, 800)).toBe('month');
  });

  it('handles exact match at day scale', () => {
    // 20 days * 40px = 800px exactly
    expect(pickFitScale(20, 800)).toBe('day');
  });

  it('handles very large viewport', () => {
    // 365 days: month=2190, week=5840, day=14600
    // diffs from 20000: month=17810, week=14160, day=5400 → day
    expect(pickFitScale(365, 20000)).toBe('day');
  });

  it('handles 0 days — all widths are 0, day is last checked', () => {
    // 0 days: all = 0px, all diffs = 800, first (month) wins by tie
    expect(pickFitScale(0, 800)).toBe('month');
  });
});
