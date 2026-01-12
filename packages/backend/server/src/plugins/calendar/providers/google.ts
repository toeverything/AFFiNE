import { Injectable } from '@nestjs/common';

import { CalendarProviderRequestError } from '../../../base';
import { CalendarProvider } from './def';
import {
  CalendarProviderEvent,
  CalendarProviderListEventsParams,
  CalendarProviderListEventsResult,
  CalendarProviderName,
  CalendarProviderTokens,
  CalendarProviderWatchParams,
  CalendarProviderWatchResult,
} from './def';

export class CalendarSyncTokenInvalid extends Error {
  readonly code = 'calendar_sync_token_invalid';
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleUserInfo = {
  id: string;
  email?: string;
  name?: string;
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    timeZone?: string;
    colorId?: string;
    primary?: boolean;
  }>;
  nextPageToken?: string;
};

type GoogleEventItem = {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated?: string;
  recurringEventId?: string;
  originalStartTime?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  start: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
};

type GoogleEventsResponse = {
  items?: GoogleEventItem[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type GoogleWatchResponse = {
  id: string;
  resourceId: string;
  expiration?: string;
};

@Injectable()
export class GoogleCalendarProvider extends CalendarProvider {
  provider = CalendarProviderName.Google;

  getAuthUrl(state: string, redirectUri: string) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' '),
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<CalendarProviderTokens> {
    const payload = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await this.postFormJson<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      payload.toString()
    );

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      scope: response.scope,
      tokenType: response.token_type,
      expiresAt: response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000)
        : undefined,
    };
  }

  async refreshTokens(refreshToken: string): Promise<CalendarProviderTokens> {
    const payload = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });

    const response = await this.postFormJson<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      payload.toString()
    );

    return {
      accessToken: response.access_token,
      refreshToken,
      scope: response.scope,
      tokenType: response.token_type,
      expiresAt: response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000)
        : undefined,
    };
  }

  async getAccountProfile(accessToken: string) {
    const response = await this.fetchJson<GoogleUserInfo>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return {
      providerAccountId: response.id,
      displayName: response.name,
      email: response.email,
    };
  }

  async listCalendars(accessToken: string) {
    const calendars: GoogleCalendarListResponse['items'] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList'
      );
      url.searchParams.set('maxResults', '250');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.fetchJson<GoogleCalendarListResponse>(
        url.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.items?.length) {
        calendars.push(...response.items);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return calendars.map(item => ({
      id: item.id,
      summary: item.summary,
      timeZone: item.timeZone,
      colorId: item.colorId,
      primary: item.primary,
    }));
  }

  async listEvents(
    params: CalendarProviderListEventsParams
  ): Promise<CalendarProviderListEventsResult> {
    const events: CalendarProviderEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          params.calendarId
        )}/events`
      );
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('showDeleted', 'true');
      url.searchParams.set('maxResults', '2500');

      if (params.syncToken) {
        url.searchParams.set('syncToken', params.syncToken);
      } else {
        if (params.timeMin) {
          url.searchParams.set('timeMin', params.timeMin);
        }
        if (params.timeMax) {
          url.searchParams.set('timeMax', params.timeMax);
        }
        url.searchParams.set('orderBy', 'startTime');
      }

      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await this.fetchWithTokenHandling<GoogleEventsResponse>(
        url.toString(),
        params.accessToken
      );

      if (response.items?.length) {
        for (const item of response.items) {
          events.push({
            id: item.id,
            status: item.status,
            etag: item.etag,
            summary: item.summary,
            description: item.description,
            location: item.location,
            updated: item.updated,
            recurringEventId: item.recurringEventId,
            originalStartTime: item.originalStartTime,
            start: item.start,
            end: item.end,
            raw: item as Record<string, unknown>,
          });
        }
      }

      pageToken = response.nextPageToken;
      if (response.nextSyncToken) {
        nextSyncToken = response.nextSyncToken;
      }
    } while (pageToken);

    return { events, nextSyncToken };
  }

  async watchCalendar(
    params: CalendarProviderWatchParams
  ): Promise<CalendarProviderWatchResult> {
    const response = await this.fetchJson<GoogleWatchResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        params.calendarId
      )}/events/watch`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: params.channelId,
          type: 'web_hook',
          address: params.address,
          token: params.token,
        }),
      }
    );

    return {
      channelId: response.id,
      resourceId: response.resourceId,
      expiration: response.expiration
        ? new Date(Number(response.expiration))
        : undefined,
    };
  }

  async stopChannel(params: {
    accessToken: string;
    channelId: string;
    resourceId: string;
  }) {
    await this.fetchJson(
      'https://www.googleapis.com/calendar/v3/channels/stop',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: params.channelId,
          resourceId: params.resourceId,
        }),
      }
    );
  }

  private async fetchWithTokenHandling<T>(url: string, accessToken: string) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const body = await response.text();
    if (!response.ok) {
      if (response.status === 410) {
        throw new CalendarSyncTokenInvalid(body);
      }
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
}
