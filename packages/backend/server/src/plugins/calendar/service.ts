import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { CalendarAccount, Prisma } from '@prisma/client';
import { addDays, subDays } from 'date-fns';

import {
  CalendarProviderRequestError,
  Config,
  GraphqlBadRequest,
  Mutex,
  URLHelper,
} from '../../base';
import { SessionRedis } from '../../base/redis';
import { Models } from '../../models';
import type { CalendarCalDAVProviderPreset } from './config';
import {
  CalendarProvider,
  CalendarProviderEvent,
  CalendarProviderEventTime,
  CalendarProviderFactory,
  CalendarProviderName,
  CalendarSyncTokenInvalid,
} from './providers';
import type { LinkCalDAVAccountInput } from './types';

const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const DEFAULT_PAST_DAYS = 90;
const DEFAULT_FUTURE_DAYS = 180;
const SYNC_FAILURE_BACKOFF_KEY_PREFIX = 'calendar:sync:backoff:';
const SYNC_FAILURE_BACKOFF_BASE_MS = 5 * 60 * 1000;
const SYNC_FAILURE_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
const SYNC_FAILURE_BACKOFF_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private generatedWebhookToken?: string;

  constructor(
    private readonly models: Models,
    private readonly providerFactory: CalendarProviderFactory<CalendarProvider>,
    private readonly mutex: Mutex,
    private readonly redis: SessionRedis,
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
          needToStopChannel.map(async s => {
            if (!s.customChannelId || !s.customResourceId) {
              return;
            }
            return await provider.stopChannel?.({
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

  async linkCalDAVAccount(params: {
    userId: string;
    input: LinkCalDAVAccountInput;
  }) {
    const caldavConfig = this.config.calendar.caldav;
    if (!caldavConfig?.enabled) {
      throw new GraphqlBadRequest({
        code: 'caldav_disabled',
        message: 'CalDAV integration is not enabled.',
      });
    }

    const preset = caldavConfig.providers.find(
      provider => provider.id === params.input.providerPresetId
    );
    if (!preset) {
      throw new GraphqlBadRequest({
        code: 'caldav_provider_not_found',
        message: 'CalDAV provider is not available.',
      });
    }

    const provider = this.requireProvider(CalendarProviderName.CalDAV);
    if (!('discoverAccount' in provider)) {
      throw new GraphqlBadRequest({
        code: 'caldav_provider_unavailable',
        message: 'CalDAV provider is not configured.',
      });
    }

    const discovery = await (
      provider as CalendarProvider & {
        discoverAccount: (input: {
          preset: CalendarCalDAVProviderPreset;
          username: string;
          password: string;
        }) => Promise<{
          providerAccountId: string;
          serverUrl: string;
          principalUrl: string;
          calendarHomeUrl: string;
          authType?: string | null;
        }>;
      }
    ).discoverAccount({
      preset,
      username: params.input.username,
      password: params.input.password,
    });

    const account = await this.models.calendarAccount.upsert({
      userId: params.userId,
      provider: CalendarProviderName.CalDAV,
      providerAccountId: discovery.providerAccountId,
      displayName: params.input.displayName ?? null,
      email: params.input.username,
      accessToken: params.input.password,
      refreshToken: null,
      expiresAt: null,
      scope: null,
      status: 'active',
      lastError: null,
      providerPresetId: params.input.providerPresetId,
      serverUrl: discovery.serverUrl,
      principalUrl: discovery.principalUrl,
      calendarHomeUrl: discovery.calendarHomeUrl,
      username: params.input.username,
      authType: discovery.authType ?? null,
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

    const calendars = await provider.listCalendars({
      accessToken,
      account,
    });
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

    const now = Date.now();
    const backoff = await this.getSyncFailureBackoff(subscription.id);
    if (backoff && now < backoff.nextRetryAt.getTime()) {
      return;
    }

    await using lock = await this.mutex.acquire(
      `calendar:subscription:${subscriptionId}`
    );
    if (!lock) {
      return;
    }

    const lockedNow = Date.now();
    const lockedBackoff = await this.getSyncFailureBackoff(subscription.id);
    if (lockedBackoff && lockedNow < lockedBackoff.nextRetryAt.getTime()) {
      return;
    }

    const provider = this.providerFactory.get(
      account.provider as CalendarProviderName
    );
    if (!provider) {
      return;
    }

    let accessToken: string | null = null;
    try {
      const tokens = await this.ensureAccessToken(account);
      if (!tokens.accessToken) return;
      accessToken = tokens.accessToken;
    } catch (error) {
      await this.handleSubscriptionSyncFailure({
        error,
        subscription,
        account,
        provider,
      });
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
        account,
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
        try {
          await this.syncWithProvider({
            provider,
            subscriptionId: subscription.id,
            calendarId: subscription.externalCalendarId,
            accessToken,
            account,
            timeMin,
            timeMax,
            subscriptionTimezone: subscription.timezone ?? undefined,
          });
          synced = true;
        } catch (syncTokenRetryError) {
          await this.handleSubscriptionSyncFailure({
            error: syncTokenRetryError,
            subscription,
            account,
            provider,
            accessToken,
          });
          return;
        }
      } else {
        await this.handleSubscriptionSyncFailure({
          error,
          subscription,
          account,
          provider,
          accessToken,
        });
        return;
      }
    }

    if (synced) {
      await this.clearSyncFailureBackoff(subscription.id);
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
    return this.isProviderAvailableFor(provider);
  }

  isProviderAvailableFor(
    provider: CalendarProviderName,
    options?: { oauth?: boolean }
  ) {
    const instance = this.providerFactory.get(provider);
    if (!instance) {
      return false;
    }
    if (options?.oauth) {
      return instance.supportsOAuth;
    }
    return true;
  }

  getAuthUrl(
    provider: CalendarProviderName,
    state: string,
    redirectUri: string
  ) {
    const instance = this.requireProvider(provider);
    if (!instance.supportsOAuth) {
      throw new GraphqlBadRequest({
        code: 'calendar_provider_oauth_unsupported',
        message: 'Selected calendar provider does not support OAuth.',
      });
    }
    return instance.getAuthUrl(state, redirectUri);
  }

  private async syncWithProvider(params: {
    provider: CalendarProvider;
    subscriptionId: string;
    calendarId: string;
    accessToken: string;
    account: CalendarAccount;
    syncToken?: string;
    timeMin?: string;
    timeMax?: string;
    subscriptionTimezone?: string;
  }) {
    const response = await params.provider.listEvents({
      accessToken: params.accessToken,
      calendarId: params.calendarId,
      account: params.account,
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
    if (!time.date) {
      throw new Error('Calendar provider returned all-day event without date');
    }
    return {
      date: this.convertDateToUtc(time.date, zone),
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
      const status = error.data?.status ?? error.status;
      if (status === 401) {
        return true;
      }
      return error.message.includes('invalid_grant');
    }
    if (error instanceof Error) {
      return error.message.includes('invalid_grant');
    }
    return false;
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

  private async handleSubscriptionSyncFailure(params: {
    error: unknown;
    subscription: {
      id: string;
      externalCalendarId: string;
      customChannelId: string | null;
      customResourceId: string | null;
    };
    account: CalendarAccount;
    provider: CalendarProvider;
    accessToken?: string;
  }) {
    if (this.isSubscriptionMissingError(params.error)) {
      await this.disableSubscription({
        subscriptionId: params.subscription.id,
        provider: params.provider,
        accessToken: params.accessToken,
        customChannelId: params.subscription.customChannelId,
        customResourceId: params.subscription.customResourceId,
      });
      this.logger.warn(
        `Calendar subscription ${params.subscription.id} was disabled because provider returned 404 for calendar ${params.subscription.externalCalendarId}`
      );
      return;
    }

    if (this.isTokenInvalidError(params.error)) {
      await this.clearSyncFailureBackoff(params.subscription.id);
      await this.models.calendarAccount.invalidateAndPurge(
        params.account.id,
        this.formatSyncError(params.error)
      );
      return;
    }

    const backoff = await this.bumpSyncFailureBackoff(params.subscription.id);
    const interval = params.account.refreshIntervalMinutes ?? 60;
    const lastSyncAt = this.calculateLastSyncAtForRetry(
      backoff.nextRetryAt,
      interval
    );
    await this.models.calendarSubscription.updateLastSyncAt(
      params.subscription.id,
      lastSyncAt
    );
    this.logger.warn(
      `Calendar sync failed for subscription ${params.subscription.id}, attempt ${backoff.attempt}, next retry at ${backoff.nextRetryAt.toISOString()}`,
      this.toError(params.error)
    );
  }

  private isSubscriptionMissingError(error: unknown) {
    if (!(error instanceof CalendarProviderRequestError)) {
      return false;
    }
    const status = error.data?.status ?? error.status;
    return status === 404;
  }

  private calculateLastSyncAtForRetry(
    nextRetryAt: Date,
    refreshIntervalMinutes: number
  ) {
    // Cron schedules by `now - lastSyncAt >= refreshInterval`, so back-calculate
    // a synthetic lastSyncAt to defer the next attempt to `nextRetryAt`.
    return new Date(nextRetryAt.getTime() - refreshIntervalMinutes * 60 * 1000);
  }

  private async disableSubscription(params: {
    subscriptionId: string;
    provider: CalendarProvider;
    accessToken?: string;
    customChannelId: string | null;
    customResourceId: string | null;
  }) {
    if (
      params.provider.stopChannel &&
      params.accessToken &&
      params.customChannelId &&
      params.customResourceId
    ) {
      try {
        await params.provider.stopChannel({
          accessToken: params.accessToken,
          channelId: params.customChannelId,
          resourceId: params.customResourceId,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to stop webhook channel for disabled calendar subscription ${params.subscriptionId}`,
          this.toError(error)
        );
      }
    }

    await this.models.calendarSubscription.disableAndPurge(
      params.subscriptionId
    );
    await this.clearSyncFailureBackoff(params.subscriptionId);
  }

  private getSyncFailureBackoffKey(subscriptionId: string) {
    return `${SYNC_FAILURE_BACKOFF_KEY_PREFIX}${subscriptionId}`;
  }

  private async getSyncFailureBackoff(subscriptionId: string) {
    const key = this.getSyncFailureBackoffKey(subscriptionId);
    const value = await this.redis.get(key);
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as {
        attempt?: number;
        nextRetryAt?: string;
      };
      if (!parsed.attempt || !parsed.nextRetryAt) {
        return null;
      }
      const nextRetryAt = new Date(parsed.nextRetryAt);
      if (Number.isNaN(nextRetryAt.getTime())) {
        return null;
      }
      return {
        attempt: parsed.attempt,
        nextRetryAt,
      };
    } catch {
      return null;
    }
  }

  private async bumpSyncFailureBackoff(subscriptionId: string) {
    const state = await this.getSyncFailureBackoff(subscriptionId);
    const attempt = (state?.attempt ?? 0) + 1;
    const delay = Math.min(
      SYNC_FAILURE_BACKOFF_BASE_MS * 2 ** (attempt - 1),
      SYNC_FAILURE_BACKOFF_MAX_MS
    );
    const nextRetryAt = new Date(Date.now() + delay);
    const key = this.getSyncFailureBackoffKey(subscriptionId);
    await this.redis.set(
      key,
      JSON.stringify({
        attempt,
        nextRetryAt: nextRetryAt.toISOString(),
      }),
      'EX',
      SYNC_FAILURE_BACKOFF_TTL_SECONDS
    );
    return {
      attempt,
      nextRetryAt,
    };
  }

  private async clearSyncFailureBackoff(subscriptionId: string) {
    const key = this.getSyncFailureBackoffKey(subscriptionId);
    await this.redis.del(key);
  }

  private formatSyncError(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error);
  }

  private toError(error: unknown) {
    if (error instanceof Error) {
      return error;
    }
    return new Error(this.formatSyncError(error));
  }
}
