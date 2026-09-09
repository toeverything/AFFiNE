/**
 * Unit tests for basicDateFilter in date.ts
 *
 * Strategy:
 *  - Use vi.useFakeTimers() to pin `dayjs()` (which calls Date.now internally)
 *    to a known point in time so relative-range assertions are deterministic.
 *  - Feed an RxJS `of(map)` as the upstream observable.
 *  - Collect results synchronously with firstValueFrom.
 *
 * Pinned "now" for all tests: 2025-06-15T10:00:00.000Z (a Sunday, mid-year).
 */
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { basicDateFilter } from './date';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Epoch-ms for a UTC date-time string. */
const ms = (iso: string) => new Date(iso).getTime();

/**
 * Run basicDateFilter synchronously and return the matching id set.
 * `docs` maps doc-id → raw stored value (string date or epoch-ms number).
 */
async function runFilter(
  method: string,
  docs: Map<string, string | number | undefined>,
  value?: string
): Promise<Set<string>> {
  return firstValueFrom(
    of(docs).pipe(
      basicDateFilter({ type: 'createdAt', key: 'createdAt', method, value })
    )
  );
}

// ---------------------------------------------------------------------------
// Fixed "now": 2025-06-15 10:00 UTC  (a Sunday)
// ---------------------------------------------------------------------------
const NOW_ISO = '2025-06-15T10:00:00.000Z';
const NOW_MS = ms(NOW_ISO);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// is-empty / is-not-empty
// ===========================================================================

describe('is-empty', () => {
  it('matches docs with no value', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['doc-a', undefined],
      ['doc-b', ''],
      ['doc-c', '2025-06-10'],
    ]);
    const result = await runFilter('is-empty', docs);
    expect([...result].sort()).toEqual(['doc-a', 'doc-b']);
  });
});

describe('is-not-empty', () => {
  it('matches docs that have a value', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['doc-a', undefined],
      ['doc-b', ''],
      ['doc-c', '2025-06-10'],
      ['doc-d', NOW_MS],
    ]);
    const result = await runFilter('is-not-empty', docs);
    expect([...result].sort()).toEqual(['doc-c', 'doc-d']);
  });
});

// ===========================================================================
// after  (strictly exclusive — boundary date NOT included)
// ===========================================================================

describe('after', () => {
  const docs = new Map<string, string | number | undefined>([
    ['before', '2025-06-09'], // strictly before
    ['on-boundary', '2025-06-10'], // exactly on the filter date
    ['after', '2025-06-11'], // strictly after
    ['no-value', undefined],
    ['bad-value', 'not-a-date'],
  ]);

  it('excludes the boundary date and everything before it', async () => {
    const result = await runFilter('after', docs, '2025-06-10');
    expect(result.has('before')).toBe(false);
    expect(result.has('on-boundary')).toBe(false);
    expect(result.has('after')).toBe(true);
    expect(result.has('no-value')).toBe(false);
    expect(result.has('bad-value')).toBe(false);
  });

  it('returns empty set when no value is provided', async () => {
    const result = await runFilter('after', docs, undefined);
    expect(result.size).toBe(0);
  });
});

// ===========================================================================
// before  (strictly exclusive — boundary date NOT included)
// ===========================================================================

describe('before', () => {
  const docs = new Map<string, string | number | undefined>([
    ['way-before', '2025-01-01'],
    ['on-boundary', '2025-06-10'],
    ['after', '2025-06-11'],
    ['no-value', undefined],
  ]);

  it('excludes the boundary date and everything after it', async () => {
    const result = await runFilter('before', docs, '2025-06-10');
    expect(result.has('way-before')).toBe(true);
    expect(result.has('on-boundary')).toBe(false);
    expect(result.has('after')).toBe(false);
    expect(result.has('no-value')).toBe(false);
  });

  it('returns empty set when no value is provided', async () => {
    const result = await runFilter('before', docs, undefined);
    expect(result.size).toBe(0);
  });
});

// ===========================================================================
// between  (strictly exclusive on both boundaries)
// ===========================================================================

describe('between', () => {
  const docs = new Map<string, string | number | undefined>([
    ['before-start', '2025-06-09'],
    ['on-start', '2025-06-10'],
    ['inside', '2025-06-12'],
    ['on-end', '2025-06-14'],
    ['after-end', '2025-06-15'],
  ]);

  it('matches only dates strictly between the two boundaries', async () => {
    const result = await runFilter('between', docs, '2025-06-10,2025-06-14');
    expect(result.has('before-start')).toBe(false);
    expect(result.has('on-start')).toBe(false);
    expect(result.has('inside')).toBe(true);
    expect(result.has('on-end')).toBe(false);
    expect(result.has('after-end')).toBe(false);
  });

  it('returns empty set when only one boundary is provided (incomplete range)', async () => {
    const result = await runFilter('between', docs, '2025-06-10');
    expect(result.size).toBe(0);
  });

  it('returns empty set when no value is provided', async () => {
    const result = await runFilter('between', docs, undefined);
    expect(result.size).toBe(0);
  });
});

// ===========================================================================
// last-3-days  (inclusive lower bound — NOW=2025-06-15, cutoff=2025-06-12)
// ===========================================================================

describe('last-3-days', () => {
  // now = 2025-06-15  =>  3 days ago = 2025-06-12
  const docs = new Map<string, string | number | undefined>([
    ['older', '2025-06-11'],
    ['boundary', '2025-06-12'], // exactly 3 days ago → included
    ['recent', '2025-06-14'],
    ['today', '2025-06-15'],
    ['future', '2025-06-16'],
  ]);

  it('includes the boundary day and everything after up to today', async () => {
    const result = await runFilter('last-3-days', docs);
    expect(result.has('older')).toBe(false);
    expect(result.has('boundary')).toBe(true);
    expect(result.has('recent')).toBe(true);
    expect(result.has('today')).toBe(true);
    // Future dates don't appear in real data but isAfterOrOn would include them;
    // this is expected behaviour (filter is a lower-bound, not upper-bound).
    expect(result.has('future')).toBe(true);
  });
});

// ===========================================================================
// last-7-days / last-15-days / last-30-days
// ===========================================================================

describe('last-7-days', () => {
  it('includes doc exactly 7 days ago and excludes doc 8 days ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['8-days-ago', '2025-06-07'],
      ['7-days-ago', '2025-06-08'],
      ['today', '2025-06-15'],
    ]);
    const result = await runFilter('last-7-days', docs);
    expect(result.has('8-days-ago')).toBe(false);
    expect(result.has('7-days-ago')).toBe(true);
    expect(result.has('today')).toBe(true);
  });
});

describe('last-15-days', () => {
  it('includes boundary (2025-05-31) and excludes one day earlier', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['too-old', '2025-05-30'],
      ['boundary', '2025-05-31'],
      ['in-range', '2025-06-10'],
    ]);
    const result = await runFilter('last-15-days', docs);
    expect(result.has('too-old')).toBe(false);
    expect(result.has('boundary')).toBe(true);
    expect(result.has('in-range')).toBe(true);
  });
});

describe('last-30-days', () => {
  it('includes boundary (2025-05-16) and excludes one day earlier', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['too-old', '2025-05-15'],
      ['boundary', '2025-05-16'],
      ['in-range', '2025-06-01'],
    ]);
    const result = await runFilter('last-30-days', docs);
    expect(result.has('too-old')).toBe(false);
    expect(result.has('boundary')).toBe(true);
    expect(result.has('in-range')).toBe(true);
  });
});

// ===========================================================================
// this-week  (Sunday=start for dayjs default locale; now=2025-06-15 Sunday)
// In dayjs the start-of-week for default locale is Sunday.
// startOf('week') on 2025-06-15 (Sunday) = 2025-06-15 itself.
// ===========================================================================

describe('this-week', () => {
  it('includes today (which is the start of this week) and later days', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['last-saturday', '2025-06-14'],
      ['this-sunday', '2025-06-15'],
      ['this-monday', '2025-06-16'],
    ]);
    const result = await runFilter('this-week', docs);
    expect(result.has('last-saturday')).toBe(false);
    expect(result.has('this-sunday')).toBe(true);
    expect(result.has('this-monday')).toBe(true);
  });
});

// ===========================================================================
// this-month  (now=2025-06-15 → startOf month = 2025-06-01)
// ===========================================================================

describe('this-month', () => {
  it('includes the first day of the month and excludes the last day of last month', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['last-month', '2025-05-31'],
      ['first-of-month', '2025-06-01'],
      ['mid-month', '2025-06-15'],
    ]);
    const result = await runFilter('this-month', docs);
    expect(result.has('last-month')).toBe(false);
    expect(result.has('first-of-month')).toBe(true);
    expect(result.has('mid-month')).toBe(true);
  });
});

// ===========================================================================
// this-year  (now=2025-06-15 → startOf year = 2025-01-01)
// ===========================================================================

describe('this-year', () => {
  it('includes the first day of the year and excludes last year', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['last-year', '2024-12-31'],
      ['jan-1', '2025-01-01'],
      ['today', '2025-06-15'],
    ]);
    const result = await runFilter('this-year', docs);
    expect(result.has('last-year')).toBe(false);
    expect(result.has('jan-1')).toBe(true);
    expect(result.has('today')).toBe(true);
  });
});

// ===========================================================================
// Sub-day filters — use epoch-ms values
// NOW_MS = ms('2025-06-15T10:00:00.000Z')
// ===========================================================================

describe('last-30-minutes', () => {
  // cutoff = NOW_MS - 30*60*1000
  const cutoff = NOW_MS - 30 * 60 * 1000;

  it('includes a doc updated 1 minute ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['1-min-ago', NOW_MS - 1 * 60 * 1000],
    ]);
    const result = await runFilter('last-30-minutes', docs);
    expect(result.has('1-min-ago')).toBe(true);
  });

  it('includes a doc updated exactly at the cutoff', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['at-cutoff', cutoff],
    ]);
    const result = await runFilter('last-30-minutes', docs);
    expect(result.has('at-cutoff')).toBe(true);
  });

  it('excludes a doc updated 1ms before the cutoff', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['just-before', cutoff - 1],
    ]);
    const result = await runFilter('last-30-minutes', docs);
    expect(result.has('just-before')).toBe(false);
  });

  it('handles epoch-ms stored as a numeric string', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['string-epoch', String(NOW_MS - 5 * 60 * 1000)],
    ]);
    const result = await runFilter('last-30-minutes', docs);
    expect(result.has('string-epoch')).toBe(true);
  });

  it('excludes entries with no value', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['empty', undefined],
    ]);
    const result = await runFilter('last-30-minutes', docs);
    expect(result.has('empty')).toBe(false);
  });
});

describe('last-1-hour', () => {
  const cutoff = NOW_MS - 60 * 60 * 1000;

  it('includes a doc updated 30 minutes ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['30-min-ago', NOW_MS - 30 * 60 * 1000],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('30-min-ago')).toBe(true);
  });

  it('excludes a doc updated 61 minutes ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['61-min-ago', NOW_MS - 61 * 60 * 1000],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('61-min-ago')).toBe(false);
  });

  it('includes a doc updated exactly at the cutoff boundary', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['at-cutoff', cutoff],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('at-cutoff')).toBe(true);
  });
});

describe('last-3-hours', () => {
  const cutoff = NOW_MS - 3 * 60 * 60 * 1000;

  it('includes a doc from 2 hours ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['2h-ago', NOW_MS - 2 * 60 * 60 * 1000],
    ]);
    const result = await runFilter('last-3-hours', docs);
    expect(result.has('2h-ago')).toBe(true);
  });

  it('excludes a doc from 4 hours ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['4h-ago', NOW_MS - 4 * 60 * 60 * 1000],
    ]);
    const result = await runFilter('last-3-hours', docs);
    expect(result.has('4h-ago')).toBe(false);
  });

  it('includes a doc exactly at the 3-hour cutoff', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['at-cutoff', cutoff],
    ]);
    const result = await runFilter('last-3-hours', docs);
    expect(result.has('at-cutoff')).toBe(true);
  });
});

describe('last-6-hours', () => {
  it('includes a doc from 5 hours ago and excludes one from 7 hours ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['5h-ago', NOW_MS - 5 * 60 * 60 * 1000],
      ['7h-ago', NOW_MS - 7 * 60 * 60 * 1000],
    ]);
    const result = await runFilter('last-6-hours', docs);
    expect(result.has('5h-ago')).toBe(true);
    expect(result.has('7h-ago')).toBe(false);
  });
});

describe('last-12-hours', () => {
  it('includes a doc from 11 hours ago and excludes one from 13 hours ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['11h-ago', NOW_MS - 11 * 60 * 60 * 1000],
      ['13h-ago', NOW_MS - 13 * 60 * 60 * 1000],
    ]);
    const result = await runFilter('last-12-hours', docs);
    expect(result.has('11h-ago')).toBe(true);
    expect(result.has('13h-ago')).toBe(false);
  });
});

describe('last-24-hours', () => {
  it('includes a doc from 23 hours ago and excludes one from 25 hours ago', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['23h-ago', NOW_MS - 23 * 60 * 60 * 1000],
      ['25h-ago', NOW_MS - 25 * 60 * 60 * 1000],
    ]);
    const result = await runFilter('last-24-hours', docs);
    expect(result.has('23h-ago')).toBe(true);
    expect(result.has('25h-ago')).toBe(false);
  });
});

// ===========================================================================
// Sub-day filters re-evaluate "now" on each emission (BUG 3 regression)
// ===========================================================================

describe('relative ranges re-evaluate now on every emission', () => {
  it('last-30-minutes: a second emission 40 minutes later uses the new now', async () => {
    // First emission: subscribe when time is T0 (NOW_MS)
    // A doc updated at T0-20min should match.
    // Advance clock by 40 minutes. Emit again.
    // The doc is now 60 min old relative to new now, so it should NOT match.

    const { Subject } = await import('rxjs');
    const upstream = new Subject<Map<string, string | number | undefined>>();

    const results: Set<string>[] = [];
    upstream
      .pipe(
        basicDateFilter({
          type: 'createdAt',
          key: 'createdAt',
          method: 'last-30-minutes',
        })
      )
      .subscribe(s => results.push(new Set(s)));

    const docUpdatedAt = NOW_MS - 20 * 60 * 1000; // 20 min before T0
    upstream.next(new Map([['doc-a', docUpdatedAt]]));
    // At T0 the doc is 20 min old → matches
    expect(results[0]?.has('doc-a')).toBe(true);

    // Advance fake clock by 40 minutes
    vi.advanceTimersByTime(40 * 60 * 1000);

    upstream.next(new Map([['doc-a', docUpdatedAt]]));
    // Now the doc is 60 min old → must NOT match last-30-minutes
    expect(results[1]?.has('doc-a')).toBe(false);

    upstream.complete();
  });
});

// ===========================================================================
// Value encoding edge cases (handleTimestampFilter)
// ===========================================================================

describe('timestamp value encoding', () => {
  it('accepts a numeric epoch-ms number', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['num', NOW_MS - 1000],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('num')).toBe(true);
  });

  it('accepts a pure-digit epoch-ms string', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['str', String(NOW_MS - 1000)],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('str')).toBe(true);
  });

  it('accepts an ISO date-time string parseable by new Date()', async () => {
    const isoStr = new Date(NOW_MS - 1000).toISOString();
    const docs = new Map<string, string | number | undefined>([
      ['iso', isoStr],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('iso')).toBe(true);
  });

  it('rejects an unparseable string (NaN epoch)', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['garbage', 'not-a-timestamp'],
    ]);
    const result = await runFilter('last-1-hour', docs);
    expect(result.has('garbage')).toBe(false);
  });
});

// ===========================================================================
// Removed alias keys (last-60-minutes, last-180-minutes) throw
// ===========================================================================

describe('removed alias methods throw an error', () => {
  it('last-60-minutes is no longer a valid method', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['doc', NOW_MS - 1000],
    ]);
    await expect(runFilter('last-60-minutes', docs)).rejects.toThrow(
      'Unsupported method: last-60-minutes'
    );
  });

  it('last-180-minutes is no longer a valid method', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['doc', NOW_MS - 1000],
    ]);
    await expect(runFilter('last-180-minutes', docs)).rejects.toThrow(
      'Unsupported method: last-180-minutes'
    );
  });
});

// ===========================================================================
// Unknown method throws
// ===========================================================================

describe('unknown method', () => {
  it('throws an error for an unrecognised method string', async () => {
    const docs = new Map<string, string | number | undefined>([
      ['doc', '2025-06-15'],
    ]);
    await expect(runFilter('no-such-method', docs)).rejects.toThrow(
      'Unsupported method: no-such-method'
    );
  });
});
