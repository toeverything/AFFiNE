import {
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import dayjs from 'dayjs';
import ICAL from 'ical.js';
import { EMPTY, mergeMap, switchMap, throttleTime } from 'rxjs';

import type {
  CalendarStore,
  CalendarSubscriptionConfig,
} from '../store/calendar';
import type { CalendarEvent, EventsByDateMap } from '../type';
import { parseCalendarUrl } from '../utils/calendar-url-parser';
import { isAllDay } from '../utils/is-all-day';

export class CalendarSubscription extends Entity<{ url: string }> {
  constructor(private readonly store: CalendarStore) {
    super();
  }

  config$ = LiveData.from(
    this.store.watchSubscription(this.props.url),
    {} as CalendarSubscriptionConfig
  );
  content$ = LiveData.from(
    this.store.watchSubscriptionCache(this.props.url),
    ''
  );
  name$ = LiveData.computed(get => {
    const config = get(this.config$);
    if (config?.name !== undefined) {
      return config.name;
    }
    const content = get(this.content$);
    if (!content) return '';
    try {
      const jCal = ICAL.parse(content ?? '');
      const vCalendar = new ICAL.Component(jCal);
      return (vCalendar.getFirstPropertyValue('x-wr-calname') as string) || '';
    } catch {
      return '';
    }
  });

  eventsByDateMap$ = LiveData.computed(get => {
    const content = get(this.content$);
    const config = get(this.config$);

    const map: EventsByDateMap = new Map();

    if (!content || !config?.showEvents) return map;

    const jCal = ICAL.parse(content);
    const vCalendar = new ICAL.Component(jCal);
    const vEvents = vCalendar.getAllSubcomponents('vevent');

    for (const vEvent of vEvents) {
      const event = new ICAL.Event(vEvent);
      const calendarEvent: CalendarEvent = {
        id: event.uid,
        url: this.url,
        title: event.summary,
        startAt: event.startDate,
        endAt: event.endDate,
      };

      // create index for each day of the event
      if (event.startDate && event.endDate) {
        const start = dayjs(event.startDate.toJSDate());
        const end = dayjs(event.endDate.toJSDate());

        let current = start;
        while (current.isBefore(end) || current.isSame(end, 'day')) {
          if (
            current.isSame(end, 'day') &&
            end.hour() === 0 &&
            end.minute() === 0
          ) {
            break;
          }
          const todayEvent: CalendarEvent = { ...calendarEvent };
          const dateKey = current.format('YYYY-MM-DD');
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
          todayEvent.allDay = isAllDay(current, start, end);
          todayEvent.date = current;
          todayEvent.id = `${event.uid}-${dateKey}`;
          if (
            config.showAllDayEvents ||
            (!config.showAllDayEvents && !todayEvent.allDay)
          ) {
            map.get(dateKey)?.push(todayEvent);
          }
          current = current.add(1, 'day');
        }
      } else {
        console.warn("event's start or end date is missing", event);
      }
    }

    return map;
  });

  url = this.props.url;
  loading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  update = effect(
    throttleTime(30 * 1000),
    switchMap(() =>
      fromPromise(async () => {
        const url = parseCalendarUrl(this.url);
        const response = await fetch(url);
        return await response.text();
      }).pipe(
        mergeMap(value => {
          this.store.setSubscriptionCache(this.url, value).catch(console.error);
          return EMPTY;
        }),
        catchErrorInto(this.error$),
        onStart(() => this.loading$.setValue(true)),
        onComplete(() => this.loading$.setValue(false))
      )
    )
  );

  override dispose() {
    super.dispose();
    this.update.reset();
  }
}
