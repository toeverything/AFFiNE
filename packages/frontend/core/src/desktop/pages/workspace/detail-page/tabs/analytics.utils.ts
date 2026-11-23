import type { GetDocPageAnalyticsQuery } from '@affine/graphql';

export const ANALYTICS_WINDOW_OPTIONS = [7, 14, 28, 60, 90] as const;
export const DEFAULT_ANALYTICS_WINDOW_DAYS = 28;
export const NON_TEAM_ANALYTICS_WINDOW_DAYS = 7;
export const INITIAL_MEMBERS_PAGE_SIZE = 5;
export const MAX_MEMBERS_PAGE_SIZE = 50;

export type AnalyticsSeriesPoint =
  GetDocPageAnalyticsQuery['workspace']['doc']['analytics']['series'][number];

export type AnalyticsChartPoint = {
  x: number;
  date: string;
  totalViews: number;
  uniqueViews: number;
  guestViews: number;
};

export function getAvailableAnalyticsWindowOptions() {
  return [...ANALYTICS_WINDOW_OPTIONS];
}

export function isLockedAnalyticsWindowOption(
  value: number,
  isTeamWorkspace: boolean
) {
  return !isTeamWorkspace && value > NON_TEAM_ANALYTICS_WINDOW_DAYS;
}

export function clampAnalyticsWindowDays(
  value: number,
  isTeamWorkspace: boolean
) {
  if (!isTeamWorkspace) {
    return NON_TEAM_ANALYTICS_WINDOW_DAYS;
  }
  return ANALYTICS_WINDOW_OPTIONS.includes(
    value as (typeof ANALYTICS_WINDOW_OPTIONS)[number]
  )
    ? value
    : DEFAULT_ANALYTICS_WINDOW_DAYS;
}

export function buildAnalyticsChartPoints(series: AnalyticsSeriesPoint[]) {
  const sorted = [...series].sort(
    (left, right) =>
      new Date(left.date).getTime() - new Date(right.date).getTime()
  );

  return sorted.map((point, index) => ({
    x: index,
    date: point.date,
    totalViews: point.totalViews,
    uniqueViews: point.uniqueViews,
    guestViews: point.guestViews,
  })) satisfies AnalyticsChartPoint[];
}

export function ensureMinimumChartPoints(points: AnalyticsChartPoint[]) {
  if (points.length !== 1) {
    return points;
  }

  return [
    points[0],
    {
      ...points[0],
      x: points[0].x + 1,
    },
  ] satisfies AnalyticsChartPoint[];
}
