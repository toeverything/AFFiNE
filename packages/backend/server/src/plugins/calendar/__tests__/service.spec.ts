import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import { PrismaClient } from '@prisma/client';
import ava from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import {
  CalendarProviderRequestError,
  Config,
  CryptoHelper,
  GraphqlBadRequest,
} from '../../../base';
import { ConfigModule } from '../../../base/config';
import { ServerConfigModule } from '../../../core/config';
import type {
  UpsertCalendarAccountInput,
  UpsertCalendarSubscriptionInput,
} from '../../../models';
import { Models } from '../../../models';
import { CalendarCronJobs } from '../cron';
import { CalendarModule, CalendarWorkerModule } from '../index';
import {
  CalendarProvider,
  CalendarProviderFactory,
  CalendarProviderName,
  CalendarSyncTokenInvalid,
} from '../providers';
import type {
  CalendarProviderListCalendarsParams,
  CalendarProviderListEventsParams,
  CalendarProviderStopParams,
  CalendarProviderWatchParams,
} from '../providers/def';
import { CalendarService } from '../service';

const test = ava.serial;

class MockCalendarProvider extends CalendarProvider {
  override provider = CalendarProviderName.Google;

  override getAuthUrl(_state: string, _redirectUri: string) {
    return 'https://example.com/oauth';
  }

  override async exchangeCode(_code: string, _redirectUri: string) {
    return { accessToken: 'access-token' };
  }

  override async refreshTokens(_refreshToken: string) {
    return { accessToken: 'access-token' };
  }

  override async getAccountProfile(_accessToken: string) {
    return { providerAccountId: 'mock-account' };
  }

  override async listCalendars(_params: CalendarProviderListCalendarsParams) {
    return [];
  }

  override async listEvents(_params: CalendarProviderListEventsParams) {
    return { events: [] };
  }

  override async watchCalendar(_params: CalendarProviderWatchParams) {
    return {
      channelId: 'mock-channel',
      resourceId: 'mock-resource',
    };
  }

  override async stopChannel(_params: CalendarProviderStopParams) {
    return;
  }
}

const module = await createModule({
  imports: [
    ServerConfigModule,
    CalendarModule,
    CalendarWorkerModule,
    ConfigModule.override({
      calendar: {
        google: {
          enabled: true,
          clientId: 'calendar-client-id',
          clientSecret: 'calendar-client-secret',
          externalWebhookUrl: 'https://calendar.example.com',
          webhookVerificationToken: 'calendar-webhook-token',
        },
      },
    }),
  ],
});
const calendarService = module.get(CalendarService);
const calendarCronJobs = module.get(CalendarCronJobs);
const providerFactory = module.get(CalendarProviderFactory);
const models = module.get(Models);
const db = module.get(PrismaClient);
const config = module.get(Config);
module.get(CryptoHelper).onConfigInit();

const createAccount = async (
  userId: string,
  overrides: Partial<UpsertCalendarAccountInput> = {}
) => {
  return await models.calendarAccount.upsert({
    userId,
    provider: overrides.provider ?? CalendarProviderName.Google,
    providerAccountId: overrides.providerAccountId ?? randomUUID(),
    displayName: overrides.displayName ?? 'Test Account',
    email: overrides.email ?? 'calendar@example.com',
    accessToken: overrides.accessToken ?? 'access-token',
    refreshToken: overrides.refreshToken ?? 'refresh-token',
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000),
    scope: overrides.scope ?? null,
    status: overrides.status ?? 'active',
    lastError: overrides.lastError ?? null,
    refreshIntervalMinutes: overrides.refreshIntervalMinutes ?? 30,
  });
};

const createSubscription = async (
  accountId: string,
  overrides: Partial<UpsertCalendarSubscriptionInput> & {
    syncToken?: string | null;
    nextSyncAt?: Date;
    syncRetryCount?: number;
    customChannelId?: string | null;
    customResourceId?: string | null;
    channelExpiration?: Date | null;
  } = {}
) => {
  const subscription = await models.calendarSubscription.upsert({
    accountId,
    provider: overrides.provider ?? CalendarProviderName.Google,
    externalCalendarId: overrides.externalCalendarId ?? randomUUID(),
    displayName: overrides.displayName ?? 'Test Calendar',
    timezone: overrides.timezone ?? 'UTC',
    color: overrides.color ?? null,
    enabled: overrides.enabled ?? true,
  });

  if (overrides.syncToken !== undefined) {
    await models.calendarSubscription.updateSync(subscription.id, {
      syncToken: overrides.syncToken,
    });
  }

  if (
    overrides.nextSyncAt !== undefined ||
    overrides.syncRetryCount !== undefined
  ) {
    await models.calendarSubscription.updateSync(subscription.id, {
      ...(overrides.nextSyncAt !== undefined
        ? { nextSyncAt: overrides.nextSyncAt }
        : {}),
      ...(overrides.syncRetryCount !== undefined
        ? { syncRetryCount: overrides.syncRetryCount }
        : {}),
    });
  }

  if (
    overrides.customChannelId !== undefined ||
    overrides.customResourceId !== undefined ||
    overrides.channelExpiration !== undefined
  ) {
    await models.calendarSubscription.updateChannel(subscription.id, {
      customChannelId: overrides.customChannelId ?? null,
      customResourceId: overrides.customResourceId ?? null,
      channelExpiration: overrides.channelExpiration ?? null,
    });
  }

  return (await models.calendarSubscription.get(subscription.id))!;
};

test.afterEach.always(() => {
  config.calendar.google.allowNewAccounts = true;
  mock.reset();
});

test.after.always(async () => {
  await module.close();
});

test('listAccounts includes calendars count', async t => {
  const user = await module.create(Mockers.User);
  const accountA = await createAccount(user.id);
  const accountB = await createAccount(user.id);

  await createSubscription(accountA.id, {
    externalCalendarId: randomUUID(),
  });
  await createSubscription(accountA.id, {
    externalCalendarId: randomUUID(),
  });
  await createSubscription(accountB.id, {
    externalCalendarId: randomUUID(),
  });

  const accounts = await calendarService.listAccounts(user.id);
  t.is(accounts.length, 2);

  const counts = new Map(
    accounts.map(account => [account.id, account.calendarsCount])
  );
  t.is(counts.get(accountA.id), 2);
  t.is(counts.get(accountB.id), 1);
});

test('assertCanLinkProvider blocks new google calendar accounts when disabled', async t => {
  config.calendar.google.allowNewAccounts = false;
  const user = await module.create(Mockers.User);

  const error = await t.throwsAsync(
    calendarService.assertCanLinkProvider(user.id, CalendarProviderName.Google)
  );
  t.true(error instanceof GraphqlBadRequest);
  t.is(
    (error as GraphqlBadRequest).data?.code,
    'calendar_provider_link_disabled'
  );
});

test('assertCanLinkProvider allows users with an existing google calendar account', async t => {
  config.calendar.google.allowNewAccounts = false;
  const user = await module.create(Mockers.User);
  await createAccount(user.id);

  await t.notThrowsAsync(
    calendarService.assertCanLinkProvider(user.id, CalendarProviderName.Google)
  );
});

test('handleOAuthCallback does not persist new google account when linking is disabled', async t => {
  config.calendar.google.allowNewAccounts = false;
  const provider = new MockCalendarProvider();
  mock.method(providerFactory, 'get', () => provider);
  const user = await module.create(Mockers.User);

  const error = await t.throwsAsync(
    calendarService.handleOAuthCallback({
      provider: CalendarProviderName.Google,
      code: 'code',
      redirectUri: 'https://example.com/callback',
      userId: user.id,
    })
  );
  t.true(error instanceof GraphqlBadRequest);
  t.is((await models.calendarAccount.listByUser(user.id)).length, 0);
});

test('canLinkProvider returns false for new google calendar accounts when disabled', async t => {
  config.calendar.google.allowNewAccounts = false;
  const user = await module.create(Mockers.User);

  t.false(
    await calendarService.canLinkProvider(user.id, CalendarProviderName.Google)
  );
});

test('syncSubscription resets invalid sync token and maps events', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'stale-token',
    timezone: 'UTC',
  });

  const cancelledId = randomUUID();
  const allDayId = randomUUID();

  await models.calendarEvent.upsert({
    subscriptionId: subscription.id,
    externalEventId: cancelledId,
    recurrenceId: null,
    etag: null,
    status: 'confirmed',
    title: 'to cancel',
    description: null,
    location: null,
    startAtUtc: new Date('2024-01-10T05:00:00.000Z'),
    endAtUtc: new Date('2024-01-10T06:00:00.000Z'),
    originalTimezone: 'UTC',
    allDay: false,
    providerUpdatedAt: null,
    raw: {},
  });

  const provider = new MockCalendarProvider();
  let callCount = 0;
  const listEventsMock = mock.method(provider, 'listEvents', async (_: any) => {
    callCount += 1;
    if (callCount === 1) {
      throw new CalendarSyncTokenInvalid('sync token expired');
    }

    return {
      events: [
        {
          id: cancelledId,
          status: 'cancelled',
          start: { dateTime: '2024-01-10T05:00:00.000Z' },
          end: { dateTime: '2024-01-10T06:00:00.000Z' },
          raw: {},
        },
        {
          id: allDayId,
          status: 'confirmed',
          start: { date: '2024-01-10', timeZone: 'UTC' },
          end: { date: '2024-01-11', timeZone: 'UTC' },
          raw: { source: 'test' },
        },
      ],
      nextSyncToken: 'next-token',
    };
  });

  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  t.is(listEventsMock.mock.callCount(), 2);
  t.is(listEventsMock.mock.calls[0].arguments[0].syncToken, 'stale-token');
  t.falsy(listEventsMock.mock.calls[0].arguments[0].timeMin);
  t.truthy(listEventsMock.mock.calls[1].arguments[0].timeMin);
  t.truthy(listEventsMock.mock.calls[1].arguments[0].timeMax);

  const updated = await models.calendarSubscription.get(subscription.id);
  t.is(updated?.syncToken, 'next-token');
  t.truthy(updated?.lastSyncAt);
  t.is(updated?.syncRetryCount, 0);
  t.truthy(updated?.nextSyncAt);
  t.true(updated!.nextSyncAt.getTime() > updated!.lastSyncAt!.getTime());

  const events = await models.calendarEvent.listBySubscriptionsInRange(
    [subscription.id],
    new Date('2024-01-09T00:00:00.000Z'),
    new Date('2024-01-12T00:00:00.000Z')
  );
  const allDayEvent = events.find(event => event.externalEventId === allDayId);
  t.truthy(allDayEvent);
  t.is(allDayEvent?.allDay, true);
  t.is(allDayEvent?.originalTimezone, 'UTC');
  t.is(allDayEvent?.startAtUtc.toISOString(), '2024-01-10T00:00:00.000Z');
  t.is(allDayEvent?.endAtUtc.toISOString(), '2024-01-11T00:00:00.000Z');
  t.is(
    events.some(event => event.externalEventId === cancelledId),
    false
  );
});

test('syncSubscription invalidates account on invalid grant', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  await models.calendarEvent.upsert({
    subscriptionId: subscription.id,
    externalEventId: randomUUID(),
    recurrenceId: null,
    etag: null,
    status: 'confirmed',
    title: 'existing',
    description: null,
    location: null,
    startAtUtc: new Date('2024-01-02T00:00:00.000Z'),
    endAtUtc: new Date('2024-01-02T01:00:00.000Z'),
    originalTimezone: 'UTC',
    allDay: false,
    providerUpdatedAt: null,
    raw: {},
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'listEvents', async () => {
    throw new Error('invalid_grant');
  });
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  const updatedAccount = await models.calendarAccount.get(account.id);
  t.is(updatedAccount?.status, 'invalid');
  t.truthy(updatedAccount?.lastError);

  const updatedSubscription = await models.calendarSubscription.get(
    subscription.id
  );
  t.is(updatedSubscription?.syncToken, null);

  const events = await models.calendarEvent.listBySubscriptionsInRange(
    [subscription.id],
    new Date('2024-01-01T00:00:00.000Z'),
    new Date('2024-01-03T00:00:00.000Z')
  );
  t.is(events.length, 0);
});

test('syncSubscription invalidates account when refresh token is invalid', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id, {
    accessToken: 'expired-access-token',
    expiresAt: new Date(Date.now() - 5 * 60 * 1000),
  });
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  await models.calendarEvent.upsert({
    subscriptionId: subscription.id,
    externalEventId: randomUUID(),
    recurrenceId: null,
    etag: null,
    status: 'confirmed',
    title: 'existing',
    description: null,
    location: null,
    startAtUtc: new Date('2024-01-02T00:00:00.000Z'),
    endAtUtc: new Date('2024-01-02T01:00:00.000Z'),
    originalTimezone: 'UTC',
    allDay: false,
    providerUpdatedAt: null,
    raw: {},
  });

  const provider = new MockCalendarProvider();
  const refreshMock = mock.method(provider, 'refreshTokens', async () => {
    throw new Error('invalid_grant');
  });
  const listEventsMock = mock.method(provider, 'listEvents', async () => ({
    events: [],
  }));
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  t.is(refreshMock.mock.callCount(), 1);
  t.is(listEventsMock.mock.callCount(), 0);

  const updatedAccount = await models.calendarAccount.get(account.id);
  t.is(updatedAccount?.status, 'invalid');
  t.truthy(updatedAccount?.lastError);

  const updatedSubscription = await models.calendarSubscription.get(
    subscription.id
  );
  t.is(updatedSubscription?.syncToken, null);

  const events = await models.calendarEvent.listBySubscriptionsInRange(
    [subscription.id],
    new Date('2024-01-01T00:00:00.000Z'),
    new Date('2024-01-03T00:00:00.000Z')
  );
  t.is(events.length, 0);
});

test('syncSubscription does not disable a calendar when token refresh returns 404', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id, {
    accessToken: 'expired-access-token',
    expiresAt: new Date(Date.now() - 5 * 60 * 1000),
  });
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'refreshTokens', async () => {
    throw new CalendarProviderRequestError({
      status: 404,
      message: 'Token endpoint not found',
    });
  });
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  const updated = await models.calendarSubscription.get(subscription.id);
  t.is(updated?.enabled, true);
  t.is(updated?.syncRetryCount, 1);
});

test('syncSubscription disables subscription on provider 404', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  await models.calendarEvent.upsert({
    subscriptionId: subscription.id,
    externalEventId: randomUUID(),
    recurrenceId: null,
    etag: null,
    status: 'confirmed',
    title: 'to remove',
    description: null,
    location: null,
    startAtUtc: new Date('2026-01-02T00:00:00.000Z'),
    endAtUtc: new Date('2026-01-02T01:00:00.000Z'),
    originalTimezone: 'UTC',
    allDay: false,
    providerUpdatedAt: null,
    raw: {},
  });

  const provider = new MockCalendarProvider();
  const listEventsMock = mock.method(provider, 'listEvents', async () => {
    throw new CalendarProviderRequestError({
      status: 404,
      message: JSON.stringify({
        error: {
          code: 404,
          message: 'Not Found',
          errors: [{ reason: 'notFound' }],
        },
      }),
    });
  });
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);
  await calendarService.syncSubscription(subscription.id);

  t.is(listEventsMock.mock.callCount(), 1);

  const updatedSubscription = await models.calendarSubscription.get(
    subscription.id
  );
  t.truthy(updatedSubscription);
  t.is(updatedSubscription?.enabled, false);
  t.is(updatedSubscription?.syncToken, null);

  const events = await models.calendarEvent.listBySubscriptionsInRange(
    [subscription.id],
    new Date('2024-01-01T00:00:00.000Z'),
    new Date('2026-12-31T00:00:00.000Z')
  );
  t.is(events.length, 0);
});

test('syncSubscription rolls back disable when event cleanup fails', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'listEvents', async () => {
    throw new CalendarProviderRequestError({
      status: 404,
      message: JSON.stringify({
        error: {
          code: 404,
          message: 'Not Found',
          errors: [{ reason: 'notFound' }],
        },
      }),
    });
  });
  mock.method(providerFactory, 'get', () => provider);
  mock.method(models.calendarEvent, 'deleteBySubscriptionIds', async () => {
    throw new Error('delete events failed');
  });

  await t.throwsAsync(calendarService.syncSubscription(subscription.id), {
    message: 'delete events failed',
  });

  const updatedSubscription = await models.calendarSubscription.get(
    subscription.id
  );
  t.truthy(updatedSubscription);
  t.is(updatedSubscription?.enabled, true);
  t.is(updatedSubscription?.syncToken, 'sync-token');
});

test('syncSubscription applies exponential backoff for repeated failures', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id, {
    refreshIntervalMinutes: 1,
  });
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  const provider = new MockCalendarProvider();
  const listEventsMock = mock.method(provider, 'listEvents', async () => {
    throw new Error('upstream timeout');
  });
  mock.method(providerFactory, 'get', () => provider);

  const baseDelayMs = 5 * 60 * 1000;
  let now = new Date('2026-01-01T00:00:00.000Z').getTime();
  mock.method(Date, 'now', () => now);

  await calendarService.syncSubscription(subscription.id);
  let updated = await models.calendarSubscription.get(subscription.id);
  t.is(listEventsMock.mock.callCount(), 1);
  t.is(updated?.syncRetryCount, 1);
  t.is(
    updated?.nextSyncAt.toISOString(),
    new Date(now + baseDelayMs).toISOString()
  );

  await calendarService.syncSubscription(subscription.id);
  updated = await models.calendarSubscription.get(subscription.id);
  t.is(listEventsMock.mock.callCount(), 2);
  t.is(updated?.syncRetryCount, 2);
  t.is(
    updated?.nextSyncAt.toISOString(),
    new Date(now + baseDelayMs * 2).toISOString()
  );
});

test('syncSubscription renews webhook channel when expiring', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
    customChannelId: 'old-channel',
    customResourceId: 'old-resource',
    channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'listEvents', async () => ({
    events: [],
    nextSyncToken: 'next-sync',
  }));

  provider.watchCalendar = async () => ({
    channelId: 'new-channel',
    resourceId: 'new-resource',
    expiration: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  });
  provider.stopChannel = async () => {
    return;
  };

  const watchMock = mock.method(
    provider,
    'watchCalendar',
    async (_: CalendarProviderWatchParams) => {
      return {
        channelId: 'new-channel',
        resourceId: 'new-resource',
        expiration: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };
    }
  );
  const stopMock = mock.method(provider, 'stopChannel', async () => {
    return;
  });

  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  t.is(stopMock.mock.callCount(), 1);
  t.is(watchMock.mock.callCount(), 1);
  const watchArgs = watchMock.mock.calls[0].arguments[0];
  t.is(
    watchArgs.address,
    'https://calendar.example.com/api/calendar/webhook/google'
  );
  t.is(watchArgs.token, 'calendar-webhook-token');
  t.is(watchArgs.calendarId, subscription.externalCalendarId);

  const updated = await models.calendarSubscription.get(subscription.id);
  t.is(updated?.customChannelId, 'new-channel');
  t.is(updated?.customResourceId, 'new-resource');
  t.truthy(updated?.channelExpiration);
});

test('syncSubscription replaces a webhook channel that is already gone', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
    customChannelId: 'missing-channel',
    customResourceId: 'missing-resource',
    channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'listEvents', async () => ({
    events: [],
    nextSyncToken: 'next-sync',
  }));
  const stopMock = mock.method(provider, 'stopChannel', async () => {
    throw new CalendarProviderRequestError({
      status: 404,
      message: 'Channel not found',
    });
  });
  const watchMock = mock.method(provider, 'watchCalendar', async () => ({
    channelId: 'replacement-channel',
    resourceId: 'replacement-resource',
    expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }));
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  t.is(stopMock.mock.callCount(), 1);
  t.is(watchMock.mock.callCount(), 1);
  const updated = await models.calendarSubscription.get(subscription.id);
  t.is(updated?.customChannelId, 'replacement-channel');
  t.is(updated?.customResourceId, 'replacement-resource');
  t.is(updated?.syncRetryCount, 0);
});

test('syncSubscription falls back to polling when push is unsupported', async t => {
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'listEvents', async () => ({
    events: [],
    nextSyncToken: 'next-sync',
  }));
  const watchMock = mock.method(provider, 'watchCalendar', async () => {
    throw new CalendarProviderRequestError({
      status: 400,
      message: JSON.stringify({
        error: {
          errors: [
            {
              domain: 'calendar',
              reason: 'pushNotSupportedForRequestedResource',
              message: 'Push notifications are not supported by this resource.',
            },
          ],
          code: 400,
          message: 'Push notifications are not supported by this resource.',
        },
      }),
    });
  });
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  let updated = await models.calendarSubscription.get(subscription.id);
  t.is(watchMock.mock.callCount(), 1);
  t.is(updated?.customChannelId, null);
  t.is(updated?.customResourceId, null);
  t.truthy(updated?.channelExpiration);
  t.true(
    updated!.channelExpiration!.getTime() >
      Date.now() + 365 * 24 * 60 * 60 * 1000
  );

  await calendarService.syncSubscription(subscription.id);

  updated = await models.calendarSubscription.get(subscription.id);
  t.is(watchMock.mock.callCount(), 1);
  t.is(updated?.customChannelId, null);
  t.is(updated?.customResourceId, null);
});

test('syncSubscription keeps schedule moving when webhook renewal fails', async t => {
  const now = new Date('2026-01-01T00:00:00.000Z').getTime();
  mock.method(Date, 'now', () => now);

  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id, {
    refreshIntervalMinutes: 60,
  });
  const subscription = await createSubscription(account.id, {
    syncToken: 'sync-token',
    channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
  });

  const provider = new MockCalendarProvider();
  mock.method(provider, 'listEvents', async () => ({
    events: [],
    nextSyncToken: 'next-sync',
  }));
  mock.method(provider, 'watchCalendar', async () => {
    throw new Error('watch failed');
  });
  mock.method(providerFactory, 'get', () => provider);

  await calendarService.syncSubscription(subscription.id);

  const updated = await models.calendarSubscription.get(subscription.id);
  t.truthy(updated?.lastSyncAt);
  t.is(updated?.syncRetryCount, 0);
  t.is(
    updated?.nextSyncAt.toISOString(),
    new Date(now + 15 * 60 * 1000).toISOString()
  );
});

test('pollAccounts skips when nothing is due', async t => {
  mock.method(models.calendarSubscription, 'claimDueForSync', async () => []);
  const sync = mock.method(calendarService, 'syncSubscription', async () => {});

  await calendarCronJobs.pollAccounts();

  t.is(sync.mock.callCount(), 0);
});

for (const outcome of ['success', 404, 401, 503] as const) {
  test(`syncSubscription fences an expired worker's ${outcome} result`, async t => {
    let now = Date.now();
    mock.method(Date, 'now', () => now);
    const user = await module.create(Mockers.User);
    const account = await createAccount(user.id);
    const subscription = await createSubscription(account.id, {
      syncToken: 'initial-token',
    });
    const started = [
      Promise.withResolvers<void>(),
      Promise.withResolvers<void>(),
    ];
    const release = [
      Promise.withResolvers<void>(),
      Promise.withResolvers<void>(),
    ];
    const provider = new MockCalendarProvider();
    let calls = 0;
    mock.method(provider, 'listEvents', async () => {
      const index = calls++;
      started[index].resolve();
      await release[index].promise;
      if (index === 0 && outcome !== 'success') {
        throw new CalendarProviderRequestError({
          status: outcome,
          message: 'late failure',
        });
      }
      return {
        nextSyncToken: index === 0 ? 'stale-token' : 'current-token',
        events: [
          {
            id: 'event',
            raw: {},
            summary: index === 0 ? 'stale' : 'current',
            start: { dateTime: '2026-01-02T00:00:00Z' },
            end: { dateTime: '2026-01-02T01:00:00Z' },
          },
        ],
      };
    });
    mock.method(providerFactory, 'get', () => provider);

    const stale = calendarService.syncSubscription(subscription.id);
    await started[0].promise;
    now += 31 * 60 * 1000;
    const current = calendarService.syncSubscription(subscription.id);
    await started[1].promise;
    const currentClaim = (await models.calendarSubscription.get(
      subscription.id
    ))!.syncClaimedUntil;
    t.truthy(currentClaim);
    release[0].resolve();
    await stale;
    const afterStale = await models.calendarSubscription.get(subscription.id);
    t.deepEqual(afterStale?.syncClaimedUntil, currentClaim);
    t.is(afterStale?.syncToken, 'initial-token');
    t.is(afterStale?.enabled, true);
    t.is(afterStale?.syncRetryCount, 0);
    t.is((await models.calendarAccount.get(account.id))?.status, 'active');
    t.is(
      await db.calendarEvent.count({
        where: { subscriptionId: subscription.id },
      }),
      0
    );

    release[1].resolve();
    await current;
    t.is(
      (await models.calendarSubscription.get(subscription.id))?.syncToken,
      'current-token'
    );
    t.is(
      (
        await db.calendarEvent.findFirstOrThrow({
          where: { subscriptionId: subscription.id },
        })
      ).title,
      'current'
    );
  });
}

test('pollAccounts syncs claimed subscriptions only', async t => {
  await db.calendarSubscription.updateMany({ data: { enabled: false } });
  const user = await module.create(Mockers.User);
  const account = await createAccount(user.id);
  const first = await createSubscription(account.id, {
    nextSyncAt: new Date(Date.now() - 2 * 60 * 1000),
  });
  const second = await createSubscription(account.id, {
    nextSyncAt: new Date(Date.now() - 60 * 1000),
  });
  const sync = mock.method(calendarService, 'syncSubscription', async () => {});

  await calendarCronJobs.pollAccounts();

  t.is(sync.mock.callCount(), 2);
  t.deepEqual(
    sync.mock.calls.map(call => call.arguments[0]),
    [first.id, second.id]
  );

  await calendarCronJobs.pollAccounts();
  t.is(sync.mock.callCount(), 2);

  await calendarService.enqueueSyncSubscription(first.id, 'webhook');
  const claimedUntil = (await models.calendarSubscription.get(first.id))!
    .syncClaimedUntil!;
  await models.calendarSubscription.completeSync(first.id, claimedUntil, {
    lastSyncAt: new Date(),
    nextSyncAt: new Date(Date.now() + 30 * 60 * 1000),
    syncRetryCount: 0,
  });
  await calendarCronJobs.pollAccounts();

  t.deepEqual(
    sync.mock.calls.map(call => [call.arguments[0], call.arguments[1]?.reason]),
    [
      [first.id, 'polling'],
      [second.id, 'polling'],
      [first.id, 'polling'],
    ]
  );

  for (let i = 0; i < 17; i++) {
    await createSubscription(account.id, {
      nextSyncAt: new Date(Date.now() - 1000),
    });
  }
  let active = 0;
  let maximumActive = 0;
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  sync.mock.mockImplementation(async (id, options) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    if (active === 8) started.resolve();
    await release.promise;
    await models.calendarSubscription.completeSync(id, options!.claimedUntil!, {
      lastSyncAt: new Date(),
      nextSyncAt: new Date(Date.now() + 30 * 60 * 1000),
      syncRetryCount: 0,
    });
    active--;
  });
  const poll = calendarCronJobs.pollAccounts();
  await started.promise;
  t.is(active, 8);
  release.resolve();
  await poll;
  t.is(maximumActive, 8);
  t.is(sync.mock.callCount(), 20);
});
