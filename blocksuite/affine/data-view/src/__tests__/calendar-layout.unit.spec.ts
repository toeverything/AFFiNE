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
