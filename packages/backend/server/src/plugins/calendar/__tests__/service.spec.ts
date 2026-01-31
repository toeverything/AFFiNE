import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { CryptoHelper } from '../../../base';
import { ConfigModule } from '../../../base/config';
import { ServerConfigModule } from '../../../core/config';
import type {
  UpsertCalendarAccountInput,
  UpsertCalendarSubscriptionInput,
} from '../../../models';
import { Models } from '../../../models';
import { CalendarModule } from '..';
import {
  CalendarProvider,
  CalendarProviderFactory,
  CalendarProviderName,
  CalendarSyncTokenInvalid,
} from '../providers';
import type {
  CalendarProviderListEventsParams,
  CalendarProviderStopParams,
  CalendarProviderWatchParams,
} from '../providers/def';
import { CalendarService } from '../service';

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

  override async listCalendars(_accessToken: string) {
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
const providerFactory = module.get(CalendarProviderFactory);
const models = module.get(Models);
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
