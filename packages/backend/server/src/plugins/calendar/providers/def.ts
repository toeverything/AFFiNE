import { Inject, Injectable, Logger } from '@nestjs/common';

import { CalendarProviderRequestError, Config, OnEvent } from '../../../base';
import { CalendarProviderFactory } from './factory';

export enum CalendarProviderName {
  Google = 'google',
  CalDAV = 'caldav',
}

export interface CalendarProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
}

export interface CalendarAccountProfile {
  providerAccountId: string;
  displayName?: string;
  email?: string;
}

export interface CalendarProviderCalendar {
  id: string;
  summary?: string;
  timeZone?: string;
  colorId?: string;
  primary?: boolean;
}

export interface CalendarProviderEventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface CalendarProviderEvent {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  recurringEventId?: string;
  originalStartTime?: CalendarProviderEventTime;
  start: CalendarProviderEventTime;
  end: CalendarProviderEventTime;
  raw: Record<string, unknown>;
}

export interface CalendarProviderListEventsParams {
  accessToken: string;
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  syncToken?: string;
}

export interface CalendarProviderListEventsResult {
  events: CalendarProviderEvent[];
  nextSyncToken?: string;
}

export interface CalendarProviderWatchResult {
  channelId: string;
  resourceId: string;
  expiration?: Date;
}

export interface CalendarProviderWatchParams {
  accessToken: string;
  calendarId: string;
  address: string;
  token?: string;
  channelId: string;
}

export interface CalendarProviderStopParams {
  accessToken: string;
  channelId: string;
  resourceId: string;
}

@Injectable()
export abstract class CalendarProvider {
  abstract provider: CalendarProviderName;
  abstract getAuthUrl(state: string, redirectUri: string): string;
  abstract exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<CalendarProviderTokens>;
  abstract refreshTokens(refreshToken: string): Promise<CalendarProviderTokens>;
  abstract getAccountProfile(
    accessToken: string
  ): Promise<CalendarAccountProfile>;
  abstract listCalendars(
    accessToken: string
  ): Promise<CalendarProviderCalendar[]>;
  abstract listEvents(
    params: CalendarProviderListEventsParams
  ): Promise<CalendarProviderListEventsResult>;
  abstract watchCalendar?(
    params: CalendarProviderWatchParams
  ): Promise<CalendarProviderWatchResult>;
  abstract stopChannel?(params: CalendarProviderStopParams): Promise<void>;

  protected readonly logger = new Logger(this.constructor.name);

  @Inject() private readonly factory!: CalendarProviderFactory;
  @Inject() private readonly AFFiNEConfig!: Config;

  get config() {
    return (this.AFFiNEConfig.calendar as Record<string, any>)[this.provider];
  }

  get configured() {
    return (
      !!this.config &&
      !!this.config.enabled &&
      !!this.config.clientId &&
      !!this.config.clientSecret
    );
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.setup();
  }

  @OnEvent('config.changed')
  onConfigUpdated(event: Events['config.changed']) {
    if ('calendar' in event.updates) {
      this.setup();
    }
  }

  protected setup() {
    if (this.configured) {
      this.factory.register(this);
    } else {
      this.factory.unregister(this);
    }
  }

  protected async fetchJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...init?.headers },
      ...init,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new CalendarProviderRequestError({
        status: response.status,
        message: body,
      });
    }
    if (!body) {
      return {} as T;
    }
    return JSON.parse(body) as T;
  }

  protected postFormJson<T>(
    url: string,
    body: string,
    options?: { headers?: Record<string, string> }
  ) {
    return this.fetchJson<T>(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options?.headers,
      },
    });
  }
}
