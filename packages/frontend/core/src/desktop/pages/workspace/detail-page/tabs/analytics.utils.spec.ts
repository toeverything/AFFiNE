import { describe, expect, test } from 'vitest';

import {
  ANALYTICS_WINDOW_OPTIONS,
  buildAnalyticsChartPoints,
  clampAnalyticsWindowDays,
  DEFAULT_ANALYTICS_WINDOW_DAYS,
  ensureMinimumChartPoints,
  getAvailableAnalyticsWindowOptions,
  isLockedAnalyticsWindowOption,
  NON_TEAM_ANALYTICS_WINDOW_DAYS,
} from './analytics.utils';

describe('analytics.utils', () => {
  test('clampAnalyticsWindowDays returns default for unsupported values', () => {
    expect(clampAnalyticsWindowDays(28, true)).toBe(28);
    expect(clampAnalyticsWindowDays(15, true)).toBe(
      DEFAULT_ANALYTICS_WINDOW_DAYS
    );
  });

  test('clampAnalyticsWindowDays returns only 7 days for non-team workspaces', () => {
    expect(clampAnalyticsWindowDays(7, false)).toBe(
      NON_TEAM_ANALYTICS_WINDOW_DAYS
    );
    expect(clampAnalyticsWindowDays(28, false)).toBe(
      NON_TEAM_ANALYTICS_WINDOW_DAYS
    );
  });

  test('getAvailableAnalyticsWindowOptions keeps all options visible', () => {
    expect(getAvailableAnalyticsWindowOptions()).toEqual([
      ...ANALYTICS_WINDOW_OPTIONS,
    ]);
  });

  test('isLockedAnalyticsWindowOption locks windows over 7 days for non-team workspaces', () => {
    expect(
      isLockedAnalyticsWindowOption(NON_TEAM_ANALYTICS_WINDOW_DAYS, false)
    ).toBe(false);
    expect(isLockedAnalyticsWindowOption(14, false)).toBe(true);
    expect(isLockedAnalyticsWindowOption(14, true)).toBe(false);
  });

  test('buildAnalyticsChartPoints sorts series by date and maps values', () => {
    const points = buildAnalyticsChartPoints([
      {
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
      {
        date: '2026-02-10',
        totalViews: 9,
        uniqueViews: 3,
        guestViews: 0,
      },
    ]);

    expect(points).toEqual([
      {
        x: 0,
        date: '2026-02-10',
        totalViews: 9,
        uniqueViews: 3,
        guestViews: 0,
      },
      {
        x: 1,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
    ]);
  });

  test('ensureMinimumChartPoints duplicates the only data point', () => {
    const points = ensureMinimumChartPoints([
      {
        x: 0,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
    ]);

    expect(points).toEqual([
      {
        x: 0,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
      {
        x: 1,
        date: '2026-02-12',
        totalViews: 4,
        uniqueViews: 2,
        guestViews: 1,
      },
    ]);
  });
});
