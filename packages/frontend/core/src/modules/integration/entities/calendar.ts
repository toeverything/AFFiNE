import type {
  CalendarAccountsQuery,
  CalendarEventsQuery,
  WorkspaceCalendarItemInput,
  WorkspaceCalendarsQuery,
} from '@affine/graphql';
import { Entity, LiveData } from '@toeverything/infra';
import dayjs, { type Dayjs } from 'dayjs';

import type { CalendarStore } from '../store/calendar';
import type { CalendarEvent } from '../type';

export class CalendarIntegration extends Entity {
  constructor(private readonly store: CalendarStore) {
    super();
  }

  accounts$ = new LiveData<
    NonNullable<
      CalendarAccountsQuery['currentUser']
    >['calendarAccounts'][number][]
  >([]);
  accountCalendars$ = new LiveData<
    Map<
      string,
      NonNullable<
        NonNullable<
          CalendarAccountsQuery['currentUser']
        >['calendarAccounts'][number]
      >['calendars']
    >
  >(new Map());
  workspaceCalendars$ = new LiveData<
    WorkspaceCalendarsQuery['workspace']['calendars'][number][]
  >([]);
  readonly eventsByDateMap$ = new LiveData<
    Map<
      string,
      CalendarEventsQuery['workspace']['calendars'][number]['events'][number][]
    >
  >(new Map());
  readonly eventDates$ = LiveData.computed(get => {
    const eventsByDateMap = get(this.eventsByDateMap$);
    const dates = new Set<string>();
    for (const [date, events] of eventsByDateMap) {
      if (events.length > 0) {
        dates.add(date);
      }
    }
    return dates;
  });

  private readonly subscriptionInfoById$ = LiveData.computed(get => {
    const accountCalendars = get(this.accountCalendars$);
    const workspaceCalendars = get(this.workspaceCalendars$);
    const subscriptionInfo = new Map<
      string,
      {
        subscription: NonNullable<
          NonNullable<
            CalendarAccountsQuery['currentUser']
          >['calendarAccounts'][number]
        >['calendars'][number];
        colorOverride?: string | null;
      }
    >();

    for (const calendars of accountCalendars.values()) {
      for (const calendar of calendars) {
        subscriptionInfo.set(calendar.id, { subscription: calendar });
      }
    }

    for (const item of workspaceCalendars[0]?.items ?? []) {
      const existing = subscriptionInfo.get(item.subscriptionId);
      if (!existing) continue;
      subscriptionInfo.set(item.subscriptionId, {
        ...existing,
        colorOverride: item.colorOverride,
      });
    }

    return subscriptionInfo;
  });

  eventsByDate$(date: Dayjs) {
    const dateKey = date.format('YYYY-MM-DD');
    return LiveData.computed(get => {
      const subscriptionInfoById = get(this.subscriptionInfoById$);
      const eventsByDateMap = get(this.eventsByDateMap$);
      const events = eventsByDateMap.get(dateKey) ?? [];

      return events
        .map(event => {
          const subscriptionInfo = subscriptionInfoById.get(
            event.subscriptionId
          );
          return {
            id: event.id,
            subscriptionId: event.subscriptionId,
            title: event.title ?? '',
            startAt: dayjs(event.startAtUtc),
            endAt: dayjs(event.endAtUtc),
            allDay: event.allDay,
            date,
            calendarName:
              subscriptionInfo?.subscription.displayName ??
              subscriptionInfo?.subscription.externalCalendarId ??
              '',
            calendarColor:
              subscriptionInfo?.colorOverride ??
              subscriptionInfo?.subscription.color ??
              undefined,
          } satisfies CalendarEvent;
        })
        .sort(
          (left, right) => left.startAt.valueOf() - right.startAt.valueOf()
        );
    });
  }

  async loadAccountCalendars(signal?: AbortSignal) {
    const accounts = await this.store.fetchAccounts(signal);
    this.accounts$.setValue(accounts);

    const calendarsByAccount = new Map<
      string,
      NonNullable<
        NonNullable<
          CalendarAccountsQuery['currentUser']
        >['calendarAccounts'][number]
      >['calendars']
    >();

    accounts.forEach(account => {
      calendarsByAccount.set(account.id, account.calendars ?? []);
    });

    this.accountCalendars$.setValue(calendarsByAccount);
    return calendarsByAccount;
  }

  async revalidateWorkspaceCalendars(signal?: AbortSignal) {
    const calendars = await this.store.fetchWorkspaceCalendars(signal);
    this.workspaceCalendars$.setValue(calendars);
    return calendars;
  }

  async updateWorkspaceCalendars(items: WorkspaceCalendarItemInput[]) {
    const updated = await this.store.updateWorkspaceCalendars(items);
    const next = [...this.workspaceCalendars$.value];
    const index = next.findIndex(calendar => calendar.id === updated.id);
    if (index >= 0) {
      next[index] = updated;
    } else {
      next.push(updated);
    }
    this.workspaceCalendars$.setValue(next);
    return updated;
  }

  async revalidateEventsRange(
    rangeStart: Dayjs,
    rangeEnd: Dayjs,
    signal?: AbortSignal
  ) {
    const start = rangeStart.startOf('day');
    const end = rangeEnd.endOf('day');
    const workspaceCalendarId = this.workspaceCalendars$.value[0]?.id;
    const next = new Map(this.eventsByDateMap$.value);
    let cursor = start;
    while (cursor.isBefore(end, 'day') || cursor.isSame(end, 'day')) {
      next.set(cursor.format('YYYY-MM-DD'), []);
      cursor = cursor.add(1, 'day');
    }
    if (!workspaceCalendarId) {
      this.eventsByDateMap$.setValue(next);
      return [];
    }

    const events = await this.store.fetchEvents(
      workspaceCalendarId,
      start.toISOString(),
      end.toISOString(),
      signal
    );
    for (const event of events) {
      const startAt = dayjs(event.startAtUtc);
      const endAt = dayjs(event.endAtUtc);
      let current = startAt.isBefore(start, 'day') ? start : startAt;
      const rangeEndDay = endAt.isAfter(end, 'day') ? end : endAt;

      while (
        current.isBefore(rangeEndDay, 'day') ||
        current.isSame(rangeEndDay, 'day')
      ) {
        if (
          current.isSame(endAt, 'day') &&
          endAt.hour() === 0 &&
          endAt.minute() === 0
        ) {
          break;
        }
        const dateKey = current.format('YYYY-MM-DD');
        const list = next.get(dateKey);
        if (list) {
          list.push(event);
        } else {
          next.set(dateKey, [event]);
        }
        current = current.add(1, 'day');
      }
    }
    this.eventsByDateMap$.setValue(next);
    return events;
  }

  async revalidateEvents(date: Dayjs, signal?: AbortSignal) {
    return await this.revalidateEventsRange(date, date, signal);
  }
}
