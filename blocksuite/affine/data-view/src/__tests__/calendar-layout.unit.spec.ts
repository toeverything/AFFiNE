import { describe, expect, it } from 'vitest';

import {
  type CalendarEntry,
  createCalendarMonthLayout,
  getCalendarDayContentSlots,
  getCalendarVisibleMonthRange,
} from '../view-presets/calendar/index.js';

const day = (value: string) => new Date(`${value}T00:00:00`).getTime();

describe('calendar month layout', () => {
  it('buckets single day entries', () => {
    const entry = {
      kind: 'row',
      id: 'database:row-1',
      sourceId: 'database',
      rowId: 'row-1',
      title: 'Task',
      startAt: day('2026-05-15'),
      cardProperties: [],
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(
      layout.days.find(item => item.date === day('2026-05-15'))?.entries
    ).toEqual([entry]);
  });

  it('splits range external entries across weeks', () => {
    const entry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'workspace-calendar',
      externalId: '1',
      title: 'Trip',
      startAt: day('2026-05-09'),
      endAt: new Date('2026-05-12T12:00:00').getTime(),
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(layout.segments).toMatchObject([
      { weekIndex: 1, startIndex: 6, span: 1 },
      { weekIndex: 2, startIndex: 0, span: 3 },
    ]);
  });

  it('treats all-day external midnight end as exclusive', () => {
    const entry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'workspace-calendar',
      externalId: '1',
      title: 'All day',
      startAt: day('2026-05-15'),
      endAt: day('2026-05-16'),
      allDay: true,
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(
      layout.days.find(item => item.date === day('2026-05-15'))?.entries
    ).toEqual([entry]);
  });

  it('treats row midnight end date as inclusive', () => {
    const entry = {
      kind: 'row',
      id: 'database:row-1',
      sourceId: 'database',
      rowId: 'row-1',
      title: 'Task',
      startAt: day('2026-05-15'),
      endAt: day('2026-05-16'),
      cardProperties: [],
      canResizeRange: true,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(layout.segments).toMatchObject([
      { weekIndex: 2, startIndex: 5, span: 2 },
    ]);
  });

  it('clips range entries to visible month range', () => {
    const entry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'workspace-calendar',
      externalId: '1',
      title: 'Long trip',
      startAt: day('2026-04-01'),
      endAt: day('2026-06-30'),
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(layout.segments[0]).toMatchObject({
      weekIndex: 0,
      startIndex: 0,
      span: 7,
    });
    expect(layout.segments.at(-1)).toMatchObject({
      weekIndex: layout.weeks.length - 1,
      startIndex: 0,
      span: 7,
    });
  });

  it('pads month view to full weeks', () => {
    const range = getCalendarVisibleMonthRange(day('2026-05-01'));
    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [],
    });

    expect(new Date(range.from).getDay()).toBe(0);
    expect(new Date(range.to).getDay()).toBe(6);
    expect(layout.days).toHaveLength(layout.weeks.length * 7);
  });

  it('keeps day buckets on local midnight across DST boundaries', () => {
    const entry = {
      kind: 'row',
      id: 'database:row-1',
      sourceId: 'database',
      rowId: 'row-1',
      title: 'DST task',
      startAt: day('2026-03-09'),
      cardProperties: [],
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-03-01'),
      entries: [entry],
    });

    expect(
      layout.days.every(item => {
        const date = new Date(item.date);
        return (
          date.getHours() === 0 &&
          date.getMinutes() === 0 &&
          date.getSeconds() === 0 &&
          date.getMilliseconds() === 0
        );
      })
    ).toBe(true);
    expect(
      layout.days.find(item => item.date === day('2026-03-09'))?.entries
    ).toEqual([entry]);
  });

  it('keeps range segment offsets across DST boundaries', () => {
    const entry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'workspace-calendar',
      externalId: '1',
      title: 'DST range',
      startAt: day('2026-03-09'),
      endAt: new Date('2026-03-10T12:00:00').getTime(),
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-03-01'),
      entries: [entry],
    });

    expect(layout.segments).toMatchObject([
      { weekIndex: 1, startIndex: 1, span: 2 },
    ]);
  });

  it('keeps all same-day entries in the day bucket', () => {
    const entries = Array.from(
      { length: 4 },
      (_, index) =>
        ({
          kind: 'row',
          id: `database:row-${index}`,
          sourceId: 'database',
          rowId: `row-${index}`,
          title: `Task ${index}`,
          startAt: day('2026-05-15'),
          cardProperties: [],
          canResizeRange: false,
        }) satisfies CalendarEntry
    );

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries,
    });

    expect(
      layout.days.find(item => item.date === day('2026-05-15'))?.entries
    ).toHaveLength(4);
  });

  it('assigns each overlapping range segment to its own slot', () => {
    const entries: CalendarEntry[] = [
      ...Array.from(
        { length: 3 },
        (_, index) =>
          ({
            kind: 'external',
            id: `external:full-${index}`,
            sourceId: 'workspace-calendar',
            externalId: `full-${index}`,
            title: `Full ${index}`,
            startAt: day('2026-05-15'),
            endAt: new Date('2026-05-17T12:00:00').getTime(),
            canResizeRange: false,
          }) as const
      ),
      {
        kind: 'external',
        id: 'external:short',
        sourceId: 'workspace-calendar',
        externalId: 'short',
        title: 'Short',
        startAt: day('2026-05-18'),
        endAt: new Date('2026-05-19T12:00:00').getTime(),
        canResizeRange: false,
      },
    ];

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries,
    });
    const may15 = layout.days.find(item => item.date === day('2026-05-15'))!;
    const may18 = layout.days.find(item => item.date === day('2026-05-18'))!;

    expect(getCalendarDayContentSlots(may15)).toBe(3);
    expect(may15.segments.map(segment => segment.slot)).toEqual([0, 1, 2]);
    expect(getCalendarDayContentSlots(may18)).toBe(1);
    expect(may18.segments.map(segment => segment.slot)).toEqual([0]);
  });

  it('counts segment and same-day slots for drag preview placement', () => {
    const entries: CalendarEntry[] = [
      ...Array.from(
        { length: 3 },
        (_, index) =>
          ({
            kind: 'external',
            id: `external:range-${index}`,
            sourceId: 'workspace-calendar',
            externalId: `range-${index}`,
            title: `Range ${index}`,
            startAt: day('2026-05-08'),
            endAt: new Date('2026-05-09T12:00:00').getTime(),
            canResizeRange: false,
          }) as const
      ),
      {
        kind: 'row',
        id: 'database:moving',
        sourceId: 'database',
        rowId: 'moving',
        title: 'Moving',
        startAt: day('2026-05-06'),
        endAt: new Date('2026-05-08T12:00:00').getTime(),
        cardProperties: [],
        canResizeRange: true,
      },
      {
        kind: 'row',
        id: 'database:single',
        sourceId: 'database',
        rowId: 'single',
        title: 'Single',
        startAt: day('2026-05-08'),
        cardProperties: [],
        canResizeRange: false,
      },
    ];

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries,
    });
    const may8 = layout.days.find(item => item.date === day('2026-05-08'))!;

    expect(getCalendarDayContentSlots(may8, 'database:moving')).toBe(4);
  });

  it('splits row range entries across weeks with continuation metadata', () => {
    const entry = {
      kind: 'row',
      id: 'database:row-1',
      sourceId: 'database',
      rowId: 'row-1',
      title: 'Project',
      startAt: day('2026-05-09'),
      endAt: new Date('2026-05-12T12:00:00').getTime(),
      cardProperties: [],
      canResizeRange: true,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(layout.segments).toMatchObject([
      {
        weekIndex: 1,
        startIndex: 6,
        span: 1,
        startsBeforeWeek: false,
        endsAfterWeek: true,
      },
      {
        weekIndex: 2,
        startIndex: 0,
        span: 3,
        startsBeforeWeek: true,
        endsAfterWeek: false,
      },
    ]);
  });

  it('skips range entries completely outside the visible month range', () => {
    const entry = {
      kind: 'external',
      id: 'external:outside',
      sourceId: 'workspace-calendar',
      externalId: 'outside',
      title: 'Outside',
      startAt: day('2026-06-10'),
      endAt: day('2026-06-12'),
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
    });

    expect(layout.segments).toEqual([]);
    expect(layout.days.every(day => day.segments.length === 0)).toBe(true);
  });
});

describe('calendar month layout - weekStartsOn', () => {
  // May 2026: 1st is a Friday (day 5)
  // Sunday start  -> visible range starts Sun 2026-04-26
  // Monday start  -> visible range starts Mon 2026-04-27

  it('pads month view to full weeks starting on Sunday by default', () => {
    const range = getCalendarVisibleMonthRange(day('2026-05-01'));
    expect(new Date(range.from).getDay()).toBe(0); // Sunday
    expect(new Date(range.to).getDay()).toBe(6); // Saturday
  });

  it('pads month view to full weeks starting on Monday when weekStartsOn=1', () => {
    const range = getCalendarVisibleMonthRange(day('2026-05-01'), 1);
    expect(new Date(range.from).getDay()).toBe(1); // Monday
    expect(new Date(range.to).getDay()).toBe(0); // Sunday
  });

  it('first day of first week is Monday when weekStartsOn=1', () => {
    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [],
      weekStartsOn: 1,
    });
    const firstDay = layout.weeks[0]?.[0];
    expect(firstDay).toBeDefined();
    expect(new Date(firstDay!.date).getDay()).toBe(1); // Monday
  });

  it('first day of first week is Sunday when weekStartsOn=0', () => {
    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [],
      weekStartsOn: 0,
    });
    const firstDay = layout.weeks[0]?.[0];
    expect(firstDay).toBeDefined();
    expect(new Date(firstDay!.date).getDay()).toBe(0); // Sunday
  });

  it('last day of last week is Sunday when weekStartsOn=1', () => {
    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [],
      weekStartsOn: 1,
    });
    const lastWeek = layout.weeks.at(-1)!;
    const lastDay = lastWeek.at(-1)!;
    expect(new Date(lastDay.date).getDay()).toBe(0); // Sunday
  });

  it('last day of last week is Saturday when weekStartsOn=0', () => {
    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [],
      weekStartsOn: 0,
    });
    const lastWeek = layout.weeks.at(-1)!;
    const lastDay = lastWeek.at(-1)!;
    expect(new Date(lastDay.date).getDay()).toBe(6); // Saturday
  });

  it('every week has exactly 7 days regardless of weekStartsOn', () => {
    for (const weekStartsOn of [0, 1] as const) {
      const layout = createCalendarMonthLayout({
        month: day('2026-05-01'),
        entries: [],
        weekStartsOn,
      });
      for (const week of layout.weeks) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it('still places a single-day entry on the correct day when weekStartsOn=1', () => {
    const entry = {
      kind: 'row',
      id: 'database:row-1',
      sourceId: 'database',
      rowId: 'row-1',
      title: 'Task',
      startAt: day('2026-05-15'),
      cardProperties: [],
      canResizeRange: false,
    } satisfies CalendarEntry;

    const layout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
      weekStartsOn: 1,
    });

    expect(
      layout.days.find(item => item.date === day('2026-05-15'))?.entries
    ).toEqual([entry]);
  });

  it('splits range entries correctly with Monday start - segment positions differ from Sunday start', () => {
    // 2026-05-09 is a Saturday; in a Sunday-start grid it is column index 6 of week 1
    // In a Monday-start grid May 9 falls on Saturday = column index 5 of week 2
    const entry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'workspace-calendar',
      externalId: '1',
      title: 'Trip',
      startAt: day('2026-05-09'),
      endAt: new Date('2026-05-12T12:00:00').getTime(),
      canResizeRange: false,
    } satisfies CalendarEntry;

    const sundayLayout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
      weekStartsOn: 0,
    });
    const mondayLayout = createCalendarMonthLayout({
      month: day('2026-05-01'),
      entries: [entry],
      weekStartsOn: 1,
    });

    // Sunday-start: May 9 (Sat) = last column of week 1
    expect(sundayLayout.segments[0]).toMatchObject({
      weekIndex: 1,
      startIndex: 6,
    });

    // Monday-start: May 9 (Sat) = column 5 of week 1 (Mon=0…Sun=6)
    expect(mondayLayout.segments[0]).toMatchObject({
      weekIndex: 1,
      startIndex: 5,
    });
  });

  it('visible month range is identical for Sunday-start month where 1st falls on Sunday', () => {
    // 2026-11-01 is a Sunday -> no padding on the left needed for either start mode
    const rangeSun = getCalendarVisibleMonthRange(day('2026-11-01'), 0);
    const rangeMon = getCalendarVisibleMonthRange(day('2026-11-01'), 1);

    expect(new Date(rangeSun.from).getDay()).toBe(0); // starts on 2026-11-01 itself
    expect(new Date(rangeMon.from).getDay()).toBe(1); // Monday 2026-10-26
    // Both ranges cover Nov 1
    expect(rangeSun.from).toBeLessThanOrEqual(day('2026-11-01'));
    expect(rangeMon.from).toBeLessThanOrEqual(day('2026-11-01'));
  });

  it('no left-padding when 1st of month is Monday and weekStartsOn=1', () => {
    // 2026-06-01 is a Monday - visible range should start exactly on June 1 with Monday start
    const range = getCalendarVisibleMonthRange(day('2026-06-01'), 1);
    expect(range.from).toBe(day('2026-06-01'));
    expect(new Date(range.from).getDay()).toBe(1); // Monday
  });

  it('no left-padding when 1st of month is Sunday and weekStartsOn=0', () => {
    // 2026-11-01 is a Sunday - visible range should start exactly on Nov 1 with Sunday start
    const range = getCalendarVisibleMonthRange(day('2026-11-01'), 0);
    expect(range.from).toBe(day('2026-11-01'));
    expect(new Date(range.from).getDay()).toBe(0); // Sunday
  });

  it('full left-padding (6 days) when 1st is Saturday and weekStartsOn=0', () => {
    // 2026-08-01 is a Saturday -> Sunday-start grid needs 6 days of left padding
    const range = getCalendarVisibleMonthRange(day('2026-08-01'), 0);
    expect(new Date(range.from).getDay()).toBe(0); // Sunday
    const leftPad =
      (day('2026-08-01') - range.from) / (24 * 60 * 60 * 1000);
    expect(leftPad).toBe(6);
  });

  it('full left-padding (6 days) when 1st is Sunday and weekStartsOn=1', () => {
    // 2026-11-01 is a Sunday -> Monday-start grid needs 6 days of left padding
    const range = getCalendarVisibleMonthRange(day('2026-11-01'), 1);
    expect(new Date(range.from).getDay()).toBe(1); // Monday
    const leftPad =
      (day('2026-11-01') - range.from) / (24 * 60 * 60 * 1000);
    expect(leftPad).toBe(6);
  });

  it('monthStart and monthEnd bounds are always present in the visible range', () => {
    for (const weekStartsOn of [0, 1] as const) {
      const range = getCalendarVisibleMonthRange(day('2026-05-01'), weekStartsOn);
      expect(range.from).toBeLessThanOrEqual(range.monthStart);
      expect(range.to).toBeGreaterThanOrEqual(range.monthEnd);
    }
  });
});
