/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from 'vitest';

import {
  calendarEventToExternalEntry,
  selectWorkspaceCalendarSubscriptionIds,
  WorkspaceCalendarExternalSource,
} from './workspace-calendar-source';

const accountCalendarsState = (value: unknown) => ({
  ['accountCalendars$']: { value },
});

const workspaceCalendarsState = (value: unknown) => ({
  ['workspaceCalendars$']: { value },
});

describe('workspace calendar source', () => {
  it('intersects workspace enabled items with view subscription ids', () => {
    const workspaceItems = [
      { subscriptionId: 'a', enabled: true },
      { subscriptionId: 'b', enabled: false },
      { subscriptionId: 'c', enabled: true },
    ];
    const cases = [
      {
        viewConfig: {
          enabled: true,
          subscriptionIds: ['b', 'c'],
        },
        expected: ['c'],
      },
      {
        viewConfig: {
          enabled: false,
        },
        expected: [],
      },
    ];

    for (const { viewConfig, expected } of cases) {
      const ids = selectWorkspaceCalendarSubscriptionIds(
        workspaceItems,
        viewConfig
      );

      expect([...ids]).toEqual(expected);
    }
  });

  it('maps event range to an external entry', () => {
    const entry = calendarEventToExternalEntry(
      {
        id: 'event-1',
        subscriptionId: 'sub-1',
        externalEventId: 'external-1',
        title: 'Planning',
        description: 'Discuss roadmap',
        location: 'Room A',
        startAtUtc: '2026-05-15T01:00:00.000Z',
        endAtUtc: '2026-05-16T01:00:00.000Z',
        allDay: false,
      } as any,
      {
        color: '#2f7d32',
        calendarName: 'Work',
      }
    );

    expect(entry).toMatchObject({
      kind: 'external',
      id: 'workspace-calendar:event-1',
      externalId: 'external-1',
      title: 'Planning',
      color: '#2f7d32',
      calendarName: 'Work',
      description: 'Discuss roadmap',
      location: 'Room A',
    });
    expect(entry.endAt).toBeGreaterThan(entry.startAt);
  });

  it('falls back to stable visible colors for muted calendar colors', () => {
    const event = {
      id: 'event-1',
      subscriptionId: 'sub-1',
      title: 'Planning',
      startAtUtc: '2026-05-15T01:00:00.000Z',
      endAtUtc: '2026-05-16T01:00:00.000Z',
      allDay: false,
    } as any;

    expect(calendarEventToExternalEntry(event, { color: '#00f' }).color).toBe(
      '#6f6b2f'
    );
    expect(calendarEventToExternalEntry(event, { color: '#eee' }).color).toBe(
      '#6f6b2f'
    );
    expect(calendarEventToExternalEntry(event).color).toBe('#6f6b2f');
  });

  it('uses workspace color override before account calendar color', async () => {
    const source = new WorkspaceCalendarExternalSource(
      {
        ...accountCalendarsState(
          new Map([['account-1', [{ id: 'sub-1', color: '#111' }]]])
        ),
        ...workspaceCalendarsState([
          {
            items: [
              {
                subscriptionId: 'sub-1',
                enabled: true,
                colorOverride: '#ad3b69',
              },
            ],
          },
        ]),
        revalidateEventsRange: vi.fn().mockResolvedValue([
          {
            id: 'event-1',
            subscriptionId: 'sub-1',
            title: 'Planning',
            startAtUtc: '2026-05-15T01:00:00.000Z',
            endAtUtc: '2026-05-15T02:00:00.000Z',
            allDay: false,
          },
        ]),
      } as any,
      () => true,
      {
        sources: {
          workspaceCalendar: {
            enabled: true,
          },
        },
      } as any
    );

    await expect(
      source.getEntries({ from: Date.now(), to: Date.now() })
    ).resolves.toMatchObject([{ color: '#ad3b69' }]);
    expect(source.getSubscriptionOptions()).toEqual([
      {
        id: 'sub-1',
        name: 'sub-1',
        color: '#ad3b69',
      },
    ]);
  });

  it('returns empty entries without server', async () => {
    const revalidateEventsRange = vi.fn();
    const source = new WorkspaceCalendarExternalSource(
      {
        ...accountCalendarsState(new Map()),
        ...workspaceCalendarsState([
          {
            items: [{ subscriptionId: 'sub-1', enabled: true }],
          },
        ]),
        revalidateEventsRange,
      } as any,
      () => false,
      {
        sources: {
          workspaceCalendar: {
            enabled: true,
          },
        },
      } as any
    );

    await expect(
      source.getEntries({ from: Date.now(), to: Date.now() })
    ).resolves.toEqual([]);
    expect(revalidateEventsRange).not.toHaveBeenCalled();
  });

  it('opens workspace integration settings from connect entry', () => {
    const openSettings = vi.fn();
    const source = new WorkspaceCalendarExternalSource(
      undefined,
      () => false,
      {
        sources: {
          workspaceCalendar: {
            enabled: true,
          },
        },
      } as any,
      openSettings
    );

    source.openConnectSettings();

    expect(openSettings).toHaveBeenCalled();
  });

  it('loads empty calendar caches before fetching entries', async () => {
    const loadAccountCalendars = vi.fn().mockResolvedValue(
      new Map([
        [
          'account-1',
          [
            {
              id: 'sub-1',
              displayName: 'Work',
              color: '#111',
            },
          ],
        ],
      ])
    );
    const revalidateWorkspaceCalendars = vi.fn().mockResolvedValue([
      {
        items: [{ subscriptionId: 'sub-1', enabled: true }],
      },
    ]);
    const source = new WorkspaceCalendarExternalSource(
      {
        ...accountCalendarsState(new Map()),
        ...workspaceCalendarsState([]),
        loadAccountCalendars,
        revalidateWorkspaceCalendars,
        revalidateEventsRange: vi.fn().mockResolvedValue([
          {
            id: 'event-1',
            subscriptionId: 'sub-1',
            title: 'Planning',
            startAtUtc: '2026-05-15T01:00:00.000Z',
            endAtUtc: '2026-05-15T02:00:00.000Z',
            allDay: false,
          },
        ]),
      } as any,
      () => true,
      {
        sources: {
          workspaceCalendar: {
            enabled: true,
          },
        },
      } as any
    );

    await expect(
      source.getEntries({ from: Date.now(), to: Date.now() })
    ).resolves.toMatchObject([{ title: 'Planning' }]);
    expect(loadAccountCalendars).toHaveBeenCalled();
    expect(revalidateWorkspaceCalendars).toHaveBeenCalled();
  });

  it('returns empty entries when calendar requests fail', async () => {
    const source = new WorkspaceCalendarExternalSource(
      {
        ...accountCalendarsState(new Map()),
        ...workspaceCalendarsState([
          {
            items: [{ subscriptionId: 'sub-1', enabled: true }],
          },
        ]),
        loadAccountCalendars: vi.fn().mockResolvedValue(new Map()),
        revalidateEventsRange: vi.fn().mockRejectedValue(new Error('denied')),
      } as any,
      () => true,
      {
        sources: {
          workspaceCalendar: {
            enabled: true,
          },
        },
      } as any
    );

    await expect(
      source.getEntries({ from: Date.now(), to: Date.now() })
    ).resolves.toEqual([]);
  });

  it('returns empty entries when account calendar loading fails', async () => {
    const revalidateEventsRange = vi.fn().mockResolvedValue([
      {
        id: 'event-1',
        subscriptionId: 'sub-1',
        title: 'Planning',
        startAtUtc: '2026-05-15T01:00:00.000Z',
        endAtUtc: '2026-05-15T02:00:00.000Z',
        allDay: false,
      },
    ]);
    const source = new WorkspaceCalendarExternalSource(
      {
        ...accountCalendarsState(new Map()),
        ...workspaceCalendarsState([
          {
            items: [{ subscriptionId: 'sub-1', enabled: true }],
          },
        ]),
        loadAccountCalendars: vi.fn().mockRejectedValue(new Error('denied')),
        revalidateEventsRange,
      } as any,
      () => true,
      {
        sources: {
          workspaceCalendar: {
            enabled: true,
          },
        },
      } as any
    );

    await expect(
      source.getEntries({ from: Date.now(), to: Date.now() })
    ).resolves.toEqual([]);
    expect(revalidateEventsRange).not.toHaveBeenCalled();
  });
});
