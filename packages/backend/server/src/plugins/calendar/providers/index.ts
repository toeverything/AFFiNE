import { CalDAVProvider } from './caldav';
import { GoogleCalendarProvider } from './google';

export { CalDAVProvider } from './caldav';
export type {
  CalendarAccountProfile,
  CalendarProviderCalendar,
  CalendarProviderEvent,
  CalendarProviderEventTime,
  CalendarProviderListCalendarsParams,
  CalendarProviderListEventsParams,
  CalendarProviderListEventsResult,
  CalendarProviderTokens,
  CalendarProviderWatchParams,
  CalendarProviderWatchResult,
} from './def';
export { CalendarProviderName } from './def';
export { CalendarProvider } from './def';
export { CalendarProviderFactory } from './factory';
export { CalendarSyncTokenInvalid, GoogleCalendarProvider } from './google';

export const CalendarProviders = [GoogleCalendarProvider, CalDAVProvider];
