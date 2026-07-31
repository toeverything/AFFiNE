import type { DocsService } from '@affine/core/modules/doc';
import type { WorkspacePropertyFilter } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import dayjs, { type Dayjs, isDayjs } from 'dayjs';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class DatePropertyFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    return this.docsService
      .propertyValues$('custom:' + params.key)
      .pipe(basicDateFilter(params));
  }
}

export function basicDateFilter(
  params: FilterParams
): (
  upstream$: Observable<Map<string, string | number | undefined>>
) => Observable<Set<string>> {
  return upstream$ => {
    // value can be like "2025-01-01,2025-01-02" (for between)
    // or "2025-01-01" (for after/before)
    const filterValues = (params.value
      ?.split(',')
      .map(t => parseDate(t))
      .filter(Boolean) ?? []) as [number, number, number][];

    const method = params.method as WorkspacePropertyFilter<'date'>;

    // Sub-day relative ranges: values in minutes.
    // Note: last-60-minutes / last-1-hour and last-180-minutes / last-3-hours
    // were formerly aliased to the same duration — the minute-labelled variants
    // have been removed from the type system to avoid showing duplicate UI
    // options. Only the hour-labelled keys remain here.
    const relativeMinuteRanges: Record<string, number> = {
      'last-1-hour': 60,
      'last-3-hours': 180,
      'last-6-hours': 360,
      'last-12-hours': 720,
      'last-24-hours': 1440,
      // Keep 30-minute granularity as it has no hour alias
      'last-30-minutes': 30,
    };

    return upstream$.pipe(
      map(o => {
        // Recompute `now` on every emission so long-lived subscriptions (a page
        // left open for hours) always evaluate relative ranges against the real
        // current time, not the time the subscription was created.
        const now = dayjs();

        if (method === 'is-empty' || method === 'is-not-empty') {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (method === 'is-empty' ? !value : !!value) {
              match.add(id);
            }
          }
          return match;
        }

        // For explicit user-chosen date boundaries the semantics of "after" and
        // "before" are strictly exclusive (the boundary date itself is NOT
        // included). This matches the label shown in the UI.
        if (method === 'between') {
          if (filterValues.length < 2) {
            // Incomplete range — return empty rather than crash or match all.
            return new Set<string>();
          }
          return handleDateRangeFilter(
            o,
            parsed =>
              isStrictlyAfter(parsed, filterValues[0]) &&
              isStrictlyBefore(parsed, filterValues[1])
          );
        }

        if (method === 'after' && filterValues.length >= 1) {
          return handleDateRangeFilter(o, parsed =>
            isStrictlyAfter(parsed, filterValues[0])
          );
        }

        if (method === 'before' && filterValues.length >= 1) {
          return handleDateRangeFilter(o, parsed =>
            isStrictlyBefore(parsed, filterValues[0])
          );
        }

        if (method in relativeMinuteRanges) {
          const minutes = relativeMinuteRanges[method];
          const cutoff = now.subtract(minutes, 'minute').valueOf();
          return handleTimestampFilter(o, ts => ts >= cutoff);
        }

        // Day-granularity relative ranges use inclusive lower bound so that a
        // doc created exactly N days ago is still included (matches user intent
        // for "last N days").
        const relativeRanges: Record<string, Dayjs> = {
          'last-3-days': now.subtract(3, 'day'),
          'last-7-days': now.subtract(7, 'day'),
          'last-15-days': now.subtract(15, 'day'),
          'last-30-days': now.subtract(30, 'day'),
          'this-week': now.startOf('week'),
          'this-month': now.startOf('month'),
          // @ts-expect-error 'quarter' is not in dayjs types, but it is supported
          'this-quarter': now.startOf('quarter'),
          'this-year': now.startOf('year'),
        };

        if (method in relativeRanges) {
          return handleDateRangeFilter(o, parsed =>
            isAfterOrOn(parsed, relativeRanges[method])
          );
        }

        throw new Error(`Unsupported method: ${method}`);
      })
    );
  };
}

function parseDate(value: string | number): [number, number, number] | null {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const [_, year, month, day] = match;
    return [parseInt(year), parseInt(month), parseInt(day)];
  } else if (typeof value === 'number') {
    const date = new Date(value);
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  }
  return null;
}

function handleDateRangeFilter(
  propertyValues: Map<string, string | number | undefined>,
  predicate: (parsed: [number, number, number]) => boolean
): Set<string> {
  const match = new Set<string>();
  for (const [id, value] of propertyValues) {
    if (!value) {
      continue;
    }
    const parsed = parseDate(value);
    if (parsed && predicate(parsed)) {
      match.add(id);
    }
  }
  return match;
}

/**
 * Timestamp-based filter that preserves sub-day precision.
 * Used for hour/minute relative ranges where date-only comparison
 * would lose precision (e.g. "last 30 minutes" on a ms epoch value).
 *
 * Accepts numeric epoch-ms, pure-digit string epoch-ms, or any date string
 * parseable by `new Date()`. Note that YYYY-MM-DD strings (custom date
 * properties) always resolve to midnight UTC, so sub-day filters are
 * effectively day-boundary filters for those properties.
 */
function handleTimestampFilter(
  propertyValues: Map<string, string | number | undefined>,
  predicate: (epochMs: number) => boolean
): Set<string> {
  const match = new Set<string>();
  for (const [id, value] of propertyValues) {
    if (!value) {
      continue;
    }
    const epochMs =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
          ? parseInt(value, 10)
          : new Date(value).getTime();
    if (!isNaN(epochMs) && predicate(epochMs)) {
      match.add(id);
    }
  }
  return match;
}

/**
 * Returns true when `targetDate` falls on or after `referenceDate` (day-level
 * inclusive comparison). Used for relative-range filters ("last N days",
 * "this week", etc.) where the boundary day should be included.
 */
function isAfterOrOn(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [ty, tm, td] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [ry, rm, rd] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    ty > ry || (ty === ry && tm > rm) || (ty === ry && tm === rm && td >= rd)
  );
}

/**
 * Returns true when `targetDate` is strictly after `referenceDate` (boundary
 * day is NOT included). Used for the explicit `after` filter method.
 */
function isStrictlyAfter(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [ty, tm, td] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [ry, rm, rd] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    ty > ry || (ty === ry && tm > rm) || (ty === ry && tm === rm && td > rd)
  );
}

/**
 * Returns true when `targetDate` is strictly before `referenceDate` (boundary
 * day is NOT included). Used for the explicit `before` filter method.
 */
function isStrictlyBefore(
  targetDate: readonly [number, number, number] | Dayjs,
  referenceDate: readonly [number, number, number] | Dayjs
): boolean {
  const [ty, tm, td] = isDayjs(targetDate)
    ? [targetDate.year(), targetDate.month() + 1, targetDate.date()]
    : targetDate;
  const [ry, rm, rd] = isDayjs(referenceDate)
    ? [referenceDate.year(), referenceDate.month() + 1, referenceDate.date()]
    : referenceDate;

  return (
    ty < ry || (ty === ry && tm < rm) || (ty === ry && tm === rm && td < rd)
  );
}
