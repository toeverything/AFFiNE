import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { CryptoHelper, GraphqlBadRequest, Mutex } from '../../../base';
import { ConfigModule } from '../../../base/config';
import { ServerConfigModule } from '../../../core/config';
import { Models } from '../../../models';
import { CalendarModule } from '..';
import {
  CalDAVProvider,
  CalendarProviderFactory,
  CalendarProviderName,
} from '../providers';
import { CalendarService } from '../service';

const USERNAME = 'caldav-user@example.com';
const PASSWORD = 'caldav-pass';
const AUTH_HEADER = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;

const buildVCalendar = (lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');

const allDayEvent = buildVCalendar([
  'BEGIN:VEVENT',
  'UID:all-day',
  'DTSTART;VALUE=DATE:20250101',
  'DTEND;VALUE=DATE:20250102',
  'SUMMARY:All Day Event',
  'END:VEVENT',
]);

const timezoneEvent = buildVCalendar([
  'BEGIN:VEVENT',
  'UID:tz-event',
  'DTSTART;TZID=America/Los_Angeles:20250103T090000',
  'DTEND;TZID=America/Los_Angeles:20250103T100000',
  'SUMMARY:Timezone Event',
  'END:VEVENT',
]);

const recurrenceEvent = buildVCalendar([
  'BEGIN:VEVENT',
  'UID:recurrence-event',
  'RECURRENCE-ID;TZID=UTC:20250104T090000',
  'DTSTART;TZID=UTC:20250104T100000',
  'DTEND;TZID=UTC:20250104T110000',
  'SUMMARY:Recurring Instance',
  'END:VEVENT',
]);

const principalResponse = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/caldav/</href>
    <propstat>
      <prop>
        <current-user-principal>
          <href>/principals/user/</href>
        </current-user-principal>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const homeSetResponse = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/principals/user/</href>
    <propstat>
      <prop>
        <calendar-home-set>
          <href>/calendars/user/</href>
        </calendar-home-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const calendarListResponse = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:IC="http://apple.com/ns/ical/">
  <response>
    <href>/calendars/user/</href>
    <propstat>
      <prop>
        <resourcetype>
          <collection />
        </resourcetype>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/calendars/user/home/</href>
    <propstat>
      <prop>
        <displayname>Home</displayname>
        <resourcetype>
          <collection />
          <calendar xmlns="urn:ietf:params:xml:ns:caldav" />
        </resourcetype>
        <calendar-timezone>BEGIN:VTIMEZONE\nTZID:UTC\nEND:VTIMEZONE</calendar-timezone>
        <calendar-color xmlns="http://apple.com/ns/ical/">#ff0000</calendar-color>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const calendarQueryResponse = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/calendars/user/home/all-day.ics</href>
    <propstat>
      <prop>
        <getetag>"1"</getetag>
        <calendar-data>${allDayEvent}</calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/calendars/user/home/timezone.ics</href>
    <propstat>
      <prop>
        <getetag>"2"</getetag>
        <calendar-data>${timezoneEvent}</calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/calendars/user/home/recurrence.ics</href>
    <propstat>
      <prop>
        <getetag>"3"</getetag>
        <calendar-data>${recurrenceEvent}</calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

const createCalDAVServer = async (options?: {
  syncCollectionStatus?: number;
}) => {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf-8');
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      body,
    });

    if (req.headers.authorization !== AUTH_HEADER) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="CalDAV"' });
      res.end();
      return;
    }

    if (req.url === '/.well-known/caldav') {
      res.writeHead(302, { Location: '/caldav/' });
      res.end();
      return;
    }

    if (req.method === 'PROPFIND' && req.url === '/caldav/') {
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(principalResponse);
      return;
    }

    if (req.method === 'PROPFIND' && req.url === '/principals/user/') {
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(homeSetResponse);
      return;
    }

    if (req.method === 'PROPFIND' && req.url === '/calendars/user/') {
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(calendarListResponse);
      return;
    }

    if (req.method === 'REPORT' && req.url === '/calendars/user/home/') {
      if (body.includes('sync-collection')) {
        const status = options?.syncCollectionStatus ?? 207;
        if (status !== 207) {
          res.writeHead(status);
          res.end();
          return;
        }
      }
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(calendarQueryResponse);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
  };
};

const createRedirectServer = async () => {
  const server = createServer((req, res) => {
    if (req.url === '/.well-known/caldav') {
      res.writeHead(302, { Location: '/.well-known/caldav' });
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>(resolve => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
};

const createCalendarModule = async (caldavConfig: Record<string, unknown>) => {
  const module = await createModule({
    imports: [
      ServerConfigModule,
      CalendarModule,
      ConfigModule.override({
        calendar: {
          google: {
            enabled: false,
            clientId: '',
            clientSecret: '',
            externalWebhookUrl: '',
            webhookVerificationToken: '',
          },
          caldav: caldavConfig,
        },
      }),
    ],
    tapModule: builder => {
      const testLock = {
        fromTest: true,
        async [Symbol.asyncDispose]() {},
      };
      builder.overrideProvider(Mutex).useValue({
        acquire: async () => testLock,
      });
    },
  });
  module.get(CryptoHelper).onConfigInit();
  const caldavProvider = module.get(CalDAVProvider);
  caldavProvider.onConfigInit();
  module.get(CalendarProviderFactory).register(caldavProvider);
  return module;
};

test('linkCalDAVAccount discovers calendars and parses events', async t => {
  const server = await createCalDAVServer();
  t.teardown(() => server.server.close());

  const module = await createCalendarModule({
    enabled: true,
    allowInsecureHttp: true,
    blockPrivateNetwork: false,
    providers: [
      {
        id: 'test',
        label: 'Test CalDAV',
        serverUrl: `${server.baseUrl}/caldav/`,
        authType: 'basic',
      },
    ],
  });
  t.teardown(() => module.close());

  const calendarService = module.get(CalendarService);
  const models = module.get(Models) as any;
  const user = await module.create(Mockers.User);

  const account = await calendarService.linkCalDAVAccount({
    userId: user.id,
    input: {
      providerPresetId: 'test',
      username: USERNAME,
      password: PASSWORD,
      displayName: 'Test CalDAV',
    },
  });

  const subscriptions = await models.calendarSubscription.listByAccount(
    account.id
  );
  t.is(subscriptions.length, 1);

  const events = await models.calendarEvent.listBySubscriptionsInRange(
    [subscriptions[0].id],
    new Date('2020-01-01T00:00:00.000Z'),
    new Date('2030-01-01T00:00:00.000Z')
  );
  t.is(events.length, 3);

  const allDay = events.find(
    (event: (typeof events)[number]) => event.title === 'All Day Event'
  );
  t.truthy(allDay);
  t.is(allDay?.allDay, true);
  t.is(allDay?.startAtUtc.toISOString(), '2025-01-01T00:00:00.000Z');
  t.is(allDay?.endAtUtc.toISOString(), '2025-01-02T00:00:00.000Z');
  t.is(allDay?.originalTimezone, 'UTC');

  const tzEvent = events.find(
    (event: (typeof events)[number]) => event.title === 'Timezone Event'
  );
  t.truthy(tzEvent);
  t.is(tzEvent?.originalTimezone, 'America/Los_Angeles');
  t.is(tzEvent?.startAtUtc.toISOString(), '2025-01-03T17:00:00.000Z');
  t.is(tzEvent?.endAtUtc.toISOString(), '2025-01-03T18:00:00.000Z');

  const recurrence = events.find(
    (event: (typeof events)[number]) => event.title === 'Recurring Instance'
  );
  t.truthy(recurrence);
  t.is(recurrence?.recurrenceId, '2025-01-04T09:00:00.000Z');
});

test('syncSubscription falls back when sync-collection is rejected', async t => {
  const server = await createCalDAVServer({ syncCollectionStatus: 403 });
  t.teardown(() => server.server.close());

  const module = await createCalendarModule({
    enabled: true,
    allowInsecureHttp: true,
    blockPrivateNetwork: false,
    providers: [
      {
        id: 'test',
        label: 'Test CalDAV',
        serverUrl: `${server.baseUrl}/caldav/`,
        authType: 'basic',
      },
    ],
  });
  t.teardown(() => module.close());

  const calendarService = module.get(CalendarService);
  const models = module.get(Models) as any;
  const user = await module.create(Mockers.User);

  const account = await models.calendarAccount.upsert({
    userId: user.id,
    provider: CalendarProviderName.CalDAV,
    providerAccountId: `${server.baseUrl}/principals/user/`,
    displayName: 'Test',
    email: USERNAME,
    accessToken: PASSWORD,
    refreshToken: null,
    expiresAt: null,
    scope: null,
    status: 'active',
    lastError: null,
    providerPresetId: 'test',
    serverUrl: server.baseUrl,
    principalUrl: `${server.baseUrl}/principals/user/`,
    calendarHomeUrl: `${server.baseUrl}/calendars/user/`,
    username: USERNAME,
    authType: 'basic',
  });

  const subscription = await models.calendarSubscription.upsert({
    accountId: account.id,
    provider: CalendarProviderName.CalDAV,
    externalCalendarId: `${server.baseUrl}/calendars/user/home/`,
    displayName: 'Home',
    timezone: 'UTC',
    color: null,
    enabled: true,
  });

  await models.calendarSubscription.updateSync(subscription.id, {
    syncToken: 'stale-token',
  });

  await calendarService.syncSubscription(subscription.id);

  t.true(
    server.requests.some(
      request =>
        request.method === 'REPORT' &&
        request.url === '/calendars/user/home/' &&
        request.body.includes('sync-collection')
    )
  );

  const updatedSubscription = await models.calendarSubscription.get(
    subscription.id
  );
  t.is(updatedSubscription?.syncToken, null);

  const events = await models.calendarEvent.listBySubscriptionsInRange(
    [subscription.id],
    new Date('2020-01-01T00:00:00.000Z'),
    new Date('2030-01-01T00:00:00.000Z')
  );
  t.is(events.length, 3);
});

test('linkCalDAVAccount blocks private network hosts', async t => {
  const module = await createCalendarModule({
    enabled: true,
    allowInsecureHttp: true,
    blockPrivateNetwork: true,
    providers: [
      {
        id: 'blocked',
        label: 'Blocked CalDAV',
        serverUrl: 'http://127.0.0.1:1/caldav/',
      },
    ],
  });
  t.teardown(() => module.close());

  const calendarService = module.get(CalendarService);
  const user = await module.create(Mockers.User);

  const error = await t.throwsAsync(async () => {
    await calendarService.linkCalDAVAccount({
      userId: user.id,
      input: {
        providerPresetId: 'blocked',
        username: USERNAME,
        password: PASSWORD,
        displayName: null,
      },
    });
  });

  t.true(error instanceof GraphqlBadRequest);
  t.is((error as GraphqlBadRequest).data?.code, 'caldav_private_network');
});

test('linkCalDAVAccount enforces allowed hosts', async t => {
  const module = await createCalendarModule({
    enabled: true,
    providers: [
      {
        id: 'blocked',
        label: 'Blocked CalDAV',
        serverUrl: 'https://blocked.example.com/caldav/',
      },
    ],
    allowedHosts: ['allowed.com'],
  });
  t.teardown(() => module.close());

  const calendarService = module.get(CalendarService);
  const user = await module.create(Mockers.User);

  const error = await t.throwsAsync(async () => {
    await calendarService.linkCalDAVAccount({
      userId: user.id,
      input: {
        providerPresetId: 'blocked',
        username: USERNAME,
        password: PASSWORD,
        displayName: null,
      },
    });
  });

  t.true(error instanceof GraphqlBadRequest);
  t.is((error as GraphqlBadRequest).data?.code, 'caldav_host_blocked');
});

test('linkCalDAVAccount enforces redirect limits', async t => {
  const server = await createRedirectServer();
  t.teardown(() => server.server.close());

  const module = await createCalendarModule({
    enabled: true,
    allowInsecureHttp: true,
    blockPrivateNetwork: false,
    maxRedirects: 0,
    providers: [
      {
        id: 'redirect',
        label: 'Redirect CalDAV',
        serverUrl: `${server.baseUrl}/caldav/`,
        authType: 'basic',
      },
    ],
  });
  t.teardown(() => module.close());

  const calendarService = module.get(CalendarService);
  const user = await module.create(Mockers.User);

  const error = await t.throwsAsync(async () => {
    await calendarService.linkCalDAVAccount({
      userId: user.id,
      input: {
        providerPresetId: 'redirect',
        username: USERNAME,
        password: PASSWORD,
        displayName: null,
      },
    });
  });

  t.true(error instanceof GraphqlBadRequest);
  t.is((error as GraphqlBadRequest).data?.code, 'caldav_max_redirects');
});
