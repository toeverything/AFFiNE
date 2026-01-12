import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { CalendarAccount, Prisma } from '@prisma/client';
import { addDays, subDays } from 'date-fns';

import {
  CalendarProviderRequestError,
  Config,
  Mutex,
  URLHelper,
} from '../../base';
import { Models } from '../../models';
import {
  CalendarProvider,
  CalendarProviderEvent,
  CalendarProviderEventTime,
  CalendarProviderName,
  CalendarSyncTokenInvalid,
} from './providers';
import { CalendarProviderFactory } from './providers';

const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const DEFAULT_PAST_DAYS = 90;
const DEFAULT_FUTURE_DAYS = 180;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private generatedWebhookToken?: string;

  constructor(
    private readonly models: Models,
    private readonly providerFactory: CalendarProviderFactory,
    private readonly mutex: Mutex,
    private readonly config: Config,
    private readonly url: URLHelper
  ) {}

  async listAccounts(userId: string) {
    const accounts = await this.models.calendarAccount.listByUser(userId);
    const accountIds = accounts.map(account => account.id);
    const subscriptions =
      await this.models.calendarSubscription.listByAccountIds(accountIds);
    const counts = new Map<string, number>();
    for (const subscription of subscriptions) {
      counts.set(
        subscription.accountId,
        (counts.get(subscription.accountId) ?? 0) + 1
      );
    }

    return accounts.map(account => ({
      ...account,
      calendarsCount: counts.get(account.id) ?? 0,
    }));
  }

  async listAccountCalendars(userId: string, accountId: string) {
    const account = await this.models.calendarAccount.get(accountId);
    if (!account || account.userId !== userId) {
      return [];
    }

    return await this.models.calendarSubscription.listByAccount(accountId);
  }

  async updateAccountRefreshInterval(
    userId: string,
    accountId: string,
    refreshIntervalMinutes: number
  ) {
    const account = await this.models.calendarAccount.get(accountId);
    if (!account || account.userId !== userId) {
      return null;
    }

    return await this.models.calendarAccount.updateRefreshInterval(
      accountId,
      refreshIntervalMinutes
    );
  }

  async unlinkAccount(userId: string, accountId: string) {
    const account = await this.models.calendarAccount.get(accountId);
    if (!account || account.userId !== userId) {
      return false;
    }

    const provider = this.providerFactory.get(
      account.provider as CalendarProviderName
    );
    const subscriptions =
      await this.models.calendarSubscription.listByAccount(accountId);
    const needToStopChannel = subscriptions.filter(
      s => s.customChannelId && s.customResourceId
    );

    if (provider?.stopChannel && needToStopChannel.length > 0) {
      const accountTokens = this.models.calendarAccount.decryptTokens(account);
      const accessToken = accountTokens.accessToken;
      if (accessToken) {
        await Promise.allSettled(
          needToStopChannel.map(s => {
            if (!s.customChannelId || !s.customResourceId) {
              return Promise.resolve();
            }
            return provider.stopChannel?.({
              accessToken,
              channelId: s.customChannelId,
              resourceId: s.customResourceId,
            });
          })
        );
      }
    }

    await this.models.calendarAccount.delete(accountId);
    return true;
  }

  async handleOAuthCallback(params: {
    provider: CalendarProviderName;
    code: string;
    redirectUri: string;
    userId: string;
  }) {
    const provider = this.requireProvider(params.provider);
    const tokens = await provider.exchangeCode(params.code, params.redirectUri);
    const profile = await provider.getAccountProfile(tokens.accessToken);

    const account = await this.models.calendarAccount.upsert({
      userId: params.userId,
      provider: params.provider,
      providerAccountId: profile.providerAccountId,
      displayName: profile.displayName ?? null,
      email: profile.email ?? null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
      status: 'active',
      lastError: null,
    });

    try {
      await this.syncAccountCalendars(account.id);
    } catch (error) {
      if (error instanceof CalendarProviderRequestError) {
        await this.models.calendarAccount.updateStatus(
          account.id,
          'invalid',
          error.message
        );
      }
      throw error;
    }
    return account;
  }

  async syncAccountCalendars(accountId: string) {
    const account = await this.models.calendarAccount.get(accountId);
    if (!account) {
      return;
    }

    const provider = this.providerFactory.get(
      account.provider as CalendarProviderName
    );
    if (!provider) {
      return;
    }

    const { accessToken } = await this.ensureAccessToken(account);
    if (!accessToken) {
      return;
    }

    const calendars = await provider.listCalendars(accessToken);
    const upserted = [];
    for (const calendar of calendars) {
      upserted.push(
        await this.models.calendarSubscription.upsert({
          accountId: account.id,
          provider: account.provider,
          externalCalendarId: calendar.id,
          displayName: calendar.summary ?? null,
          timezone: calendar.timeZone ?? null,
          color: calendar.colorId ?? null,
          enabled: true,
        })
      );
    }

    await Promise.allSettled(
      upserted.map(subscription =>
        this.syncSubscription(subscription.id, { reason: 'initial' })
      )
    );
  }

  async syncSubscription(
    subscriptionId: string,
    options?: { reason?: string; forceFull?: boolean }
  ) {
    const subscription =
      await this.models.calendarSubscription.listWithAccount(subscriptionId);
    if (!subscription || !subscription.enabled) {
      return;
    }

    const account = subscription.account;
    if (account.status !== 'active') {
      return;
    }

    await using lock = await this.mutex.acquire(
      `calendar:subscription:${subscriptionId}`
    );
    if (!lock) {
      return;
    }

    const provider = this.providerFactory.get(
      account.provider as CalendarProviderName
    );
    if (!provider) {
      return;
    }

    const { accessToken } = await this.ensureAccessToken(account);
    if (!accessToken) {
      return;
    }

    const { timeMin, timeMax } = this.getSyncWindow();
    const shouldUseSyncToken =
      !!subscription.syncToken && options?.forceFull !== true;
    let synced = false;

    try {
      await this.syncWithProvider({
        provider,
        subscriptionId: subscription.id,
        calendarId: subscription.externalCalendarId,
        accessToken,
        syncToken: shouldUseSyncToken
          ? (subscription.syncToken ?? undefined)
          : undefined,
        timeMin: shouldUseSyncToken ? undefined : timeMin,
        timeMax: shouldUseSyncToken ? undefined : timeMax,
        subscriptionTimezone: subscription.timezone ?? undefined,
      });

      synced = true;
    } catch (error) {
      if (error instanceof CalendarSyncTokenInvalid) {
        await this.models.calendarSubscription.updateSync(subscription.id, {
          syncToken: null,
        });
        await this.syncWithProvider({
          provider,
          subscriptionId: subscription.id,
          calendarId: subscription.externalCalendarId,
          accessToken,
          timeMin,
          timeMax,
          subscriptionTimezone: subscription.timezone ?? undefined,
        });
        synced = true;
      } else {
        if (this.isTokenInvalidError(error)) {
          await this.invalidateAccount(account.id, (error as Error).message);
        } else {
          this.logger.warn(
            `Calendar sync failed for subscription ${subscription.id}`,
            error as Error
          );
        }
        return;
      }
    }

    if (synced) {
      await this.ensureWebhookChannel(subscription, provider, accessToken);
    }

    await this.models.calendarSubscription.updateLastSyncAt(
      subscription.id,
      new Date()
    );
  }

  async syncAccount(accountId: string) {
    const account = await this.models.calendarAccount.get(accountId);
    if (!account || account.status !== 'active') {
      return;
    }

    const subscriptions =
      await this.models.calendarSubscription.listByAccountForSync(accountId);
    await Promise.allSettled(
      subscriptions.map(subscription =>
        this.syncSubscription(subscription.id, { reason: 'polling' })
      )
    );
  }

  async listWorkspaceEvents(params: {
    workspaceCalendarId: string;
    from: Date;
    to: Date;
  }) {
    const items = await this.models.workspaceCalendar.listItems(
      params.workspaceCalendarId
    );
    const subscriptionIds = items.map(item => item.subscriptionId);
    const events = await this.models.calendarEvent.listBySubscriptionsInRange(
      subscriptionIds,
      params.from,
      params.to
    );

    Promise.allSettled(
      subscriptionIds.map(subscriptionId =>
        this.syncSubscription(subscriptionId, { reason: 'on-demand' })
      )
    ).catch(error => {
      this.logger.warn('Calendar on-demand sync failed', error as Error);
    });

    return events;
  }

  @Transactional()
  async updateWorkspaceCalendars(params: {
    workspaceId: string;
    userId: string;
    items: Array<{
      subscriptionId: string;
      sortOrder?: number | null;
      colorOverride?: string | null;
    }>;
  }) {
    const calendar = await this.models.workspaceCalendar.getOrCreateDefault(
      params.workspaceId,
      params.userId
    );
    await this.models.workspaceCalendar.updateItems(calendar.id, params.items);
    return calendar;
  }

  async getWorkspaceCalendars(workspaceId: string) {
    const calendars =
      await this.models.workspaceCalendar.getByWorkspace(workspaceId);
    if (calendars.length === 0) {
      return [];
    }

    const items = await Promise.all(
      calendars.map(calendar =>
        this.models.workspaceCalendar.listItems(calendar.id)
      )
    );
    return calendars.map((calendar, index) => ({
      ...calendar,
      items: items[index],
    }));
  }

  async handleWebhook(providerName: CalendarProviderName, channelId: string) {
    if (providerName !== CalendarProviderName.Google) {
      return;
    }

    const subscription =
      await this.models.calendarSubscription.getByChannelId(channelId);
    if (!subscription) {
      return;
    }

    await this.syncSubscription(subscription.id, { reason: 'webhook' });
  }

  getWebhookToken() {
    const configured = this.config.calendar.google.webhookVerificationToken;
    if (configured) {
      return configured;
    }
    if (!this.generatedWebhookToken) {
      this.generatedWebhookToken = randomUUID();
    }
    return this.generatedWebhookToken;
  }

  getWebhookAddress(provider: string) {
    const externalWebhookUrl = this.config.calendar.google.externalWebhookUrl;
    if (!externalWebhookUrl) {
      return null;
    }
    return new URL(
      `/api/calendar/webhook/${provider}`,
      externalWebhookUrl
    ).toString();
  }

  getCallbackUrl() {
    return this.url.link('/api/calendar/oauth/callback');
  }

  isProviderAvailable(provider: CalendarProviderName) {
    return !!this.providerFactory.get(provider);
  }

  getAuthUrl(
    provider: CalendarProviderName,
    state: string,
    redirectUri: string
  ) {
    return this.requireProvider(provider).getAuthUrl(state, redirectUri);
  }

  private async syncWithProvider(params: {
    provider: CalendarProvider;
    subscriptionId: string;
    calendarId: string;
    accessToken: string;
    syncToken?: string;
    timeMin?: string;
    timeMax?: string;
    subscriptionTimezone?: string;
  }) {
    const response = await params.provider.listEvents({
      accessToken: params.accessToken,
      calendarId: params.calendarId,
      syncToken: params.syncToken,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
    });

    const cancelledEventIds: string[] = [];
    const failedEventIds: string[] = [];
    for (const event of response.events) {
      if (event.status === 'cancelled') {
        cancelledEventIds.push(event.id);
        continue;
      }

      try {
        await this.models.calendarEvent.upsert(
          this.mapProviderEvent(
            params.subscriptionId,
            event,
            params.subscriptionTimezone
          )
        );
      } catch {
        failedEventIds.push(event.id);
      }
    }

    if (cancelledEventIds.length > 0) {
      await this.models.calendarEvent.deleteByExternalIds(
        params.subscriptionId,
        cancelledEventIds
      );
    }
    if (failedEventIds.length > 0) {
      this.logger.warn(
        `Failed to upsert ${failedEventIds.length} events for subscription ${params.subscriptionId}`,
        { failedEventIds }
      );
    }

    if (response.nextSyncToken) {
      await this.models.calendarSubscription.updateSync(params.subscriptionId, {
        syncToken: response.nextSyncToken,
      });
    }
  }

  private mapProviderEvent(
    subscriptionId: string,
    event: CalendarProviderEvent,
    fallbackTimezone?: string
  ) {
    const { timeZone, start, end, allDay } = this.resolveEventTimes(
      event,
      fallbackTimezone
    );

    return {
      subscriptionId,
      externalEventId: event.id,
      recurrenceId: this.resolveRecurrenceId(event),
      etag: event.etag ?? null,
      status: event.status ?? null,
      title: event.summary ?? null,
      description: event.description ?? null,
      location: event.location ?? null,
      startAtUtc: start,
      endAtUtc: end,
      originalTimezone: timeZone ?? null,
      allDay,
      providerUpdatedAt: event.updated ? new Date(event.updated) : null,
      raw: event.raw as Prisma.InputJsonValue,
    };
  }

  private resolveEventTimes(
    event: CalendarProviderEvent,
    fallbackTimezone?: string
  ) {
    const startTime = this.resolveEventTime(event.start, fallbackTimezone);
    const endTime = this.resolveEventTime(event.end, fallbackTimezone);
    const timeZone =
      event.start.timeZone ?? event.end.timeZone ?? fallbackTimezone ?? null;

    return {
      start: startTime.date,
      end: endTime.date,
      allDay: startTime.allDay || endTime.allDay,
      timeZone,
    };
  }

  private resolveEventTime(
    time: CalendarProviderEventTime,
    fallbackTimezone?: string
  ) {
    if (time.dateTime) {
      return {
        date: new Date(time.dateTime),
        allDay: false,
      };
    }

    const zone = time.timeZone ?? fallbackTimezone ?? 'UTC';
    return {
      date: this.convertDateToUtc(time.date!, zone),
      allDay: true,
    };
  }

  private resolveRecurrenceId(event: CalendarProviderEvent) {
    if (event.originalStartTime?.dateTime) {
      return event.originalStartTime.dateTime;
    }
    if (event.originalStartTime?.date) {
      return event.originalStartTime.date;
    }
    return null;
  }

  private convertDateToUtc(dateString: string, timeZone: string) {
    const [year, month, day] = dateString.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const offsetMinutes = this.getTimeZoneOffset(utcDate, timeZone);
    return new Date(utcDate.getTime() - offsetMinutes * 60 * 1000);
  }

  private getTimeZoneOffset(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const lookup = (type: string) => {
      const part = parts.find(item => item.type === type);
      return part ? Number(part.value) : 0;
    };
    const asUtc = Date.UTC(
      lookup('year'),
      lookup('month') - 1,
      lookup('day'),
      lookup('hour'),
      lookup('minute'),
      lookup('second')
    );
    return (asUtc - date.getTime()) / 60000;
  }

  private getSyncWindow() {
    const now = new Date();
    return {
      timeMin: subDays(now, DEFAULT_PAST_DAYS).toISOString(),
      timeMax: addDays(now, DEFAULT_FUTURE_DAYS).toISOString(),
    };
  }

  private async ensureAccessToken(account: CalendarAccount) {
    const provider = this.providerFactory.get(
      account.provider as CalendarProviderName
    );
    if (!provider) {
      return { accessToken: null };
    }

    const decrypted = this.models.calendarAccount.decryptTokens(account);
    const accessToken = decrypted.accessToken;
    if (
      accessToken &&
      account.expiresAt &&
      account.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_SKEW_MS
    ) {
      return { accessToken };
    }

    if (!decrypted.refreshToken) {
      return { accessToken };
    }

    const refreshed = await provider.refreshTokens(decrypted.refreshToken);
    await this.models.calendarAccount.updateTokens(account.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? decrypted.refreshToken,
      expiresAt: refreshed.expiresAt ?? null,
      scope: refreshed.scope ?? null,
      status: 'active',
      lastError: null,
    });

    return { accessToken: refreshed.accessToken };
  }

  private isTokenInvalidError(error: unknown) {
    if (error instanceof CalendarProviderRequestError) {
      if (error.status === 401) {
        return true;
      }
      return error.message.includes('invalid_grant');
    }
    if (error instanceof Error) {
      return error.message.includes('invalid_grant');
    }
    return false;
  }

  private async invalidateAccount(accountId: string, lastError?: string) {
    await this.models.calendarAccount.updateStatus(
      accountId,
      'invalid',
      lastError ?? null
    );
    const subscriptions =
      await this.models.calendarSubscription.listByAccount(accountId);
    const subscriptionIds = subscriptions.map(s => s.id);
    await this.models.calendarEvent.deleteBySubscriptionIds(subscriptionIds);
    await this.models.calendarSubscription.clearSyncTokensByAccount(accountId);
  }

  private requireProvider(name: CalendarProviderName) {
    const provider = this.providerFactory.get(name);
    if (!provider) {
      throw new Error(`Calendar provider ${name} not configured`);
    }
    return provider;
  }

  private async ensureWebhookChannel(
    subscription: {
      id: string;
      externalCalendarId: string;
      customChannelId: string | null;
      customResourceId: string | null;
      channelExpiration: Date | null;
    },
    provider: CalendarProvider,
    accessToken: string
  ) {
    if (!provider.watchCalendar) {
      return;
    }

    const address = this.getWebhookAddress(provider.provider);
    if (!address) {
      return;
    }

    const renewThreshold = Date.now() + 24 * 60 * 60 * 1000;
    if (
      subscription.channelExpiration &&
      subscription.channelExpiration.getTime() > renewThreshold
    ) {
      return;
    }

    if (
      provider.stopChannel &&
      subscription.customChannelId &&
      subscription.customResourceId
    ) {
      await provider.stopChannel({
        accessToken,
        channelId: subscription.customChannelId,
        resourceId: subscription.customResourceId,
      });
    }

    const channelId = randomUUID();
    const token = this.getWebhookToken();
    const result = await provider.watchCalendar({
      accessToken,
      calendarId: subscription.externalCalendarId,
      address,
      token,
      channelId,
    });

    await this.models.calendarSubscription.updateChannel(subscription.id, {
      customChannelId: result.channelId,
      customResourceId: result.resourceId,
      channelExpiration: result.expiration ?? null,
    });
  }
}
