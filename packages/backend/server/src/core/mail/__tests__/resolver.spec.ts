import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { createApp, type TestingApp } from '../../../__tests__/e2e/test';
import { Mockers } from '../../../__tests__/mocks';

let app: TestingApp;

function startOfUtcHour(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      value.getUTCHours()
    )
  );
}

test.before(async () => {
  app = await createApp();
});

test.beforeEach(async () => {
  await app.get(PrismaClient).mailDelivery.deleteMany();
});

test.after.always(async () => {
  await app.close();
});

test.afterEach.always(async () => {
  await app.get(PrismaClient).mailDelivery.deleteMany();
});

test('sendTestEmail rejects non-admin users before SMTP or ledger', async t => {
  const user = await app.create(Mockers.User);

  await app.login(user);

  const response = await app.request('post', '/graphql').send({
    query: /* GraphQL */ `
      mutation SendTestEmail($config: JSONObject!) {
        sendTestEmail(config: $config)
      }
    `,
    variables: {
      config: {
        name: '',
        host: 'smtp.example.com',
        port: 587,
        username: 'user',
        password: 'password',
        ignoreTLS: false,
        sender: 'AFFiNE <noreply@example.com>',
      },
    },
  });

  t.is(response.status, 200);
  t.truthy(response.body.errors);
  t.is(await app.get(PrismaClient).mailDelivery.count(), 0);
});

test('adminMailDeliveries returns timeline series for status type and outcome', async t => {
  const db = app.get(PrismaClient);
  const admin = await app.create(Mockers.User, {
    feature: 'administrator',
  });
  const now = new Date();
  const createdAt = new Date(startOfUtcHour(now).getTime() - 60 * 60 * 1000);
  const base = {
    priority: 'normal',
    recipientHash: 'hash',
    recipientDomain: 'example.com',
    sendAfter: now,
    retentionState: 'anonymized',
    anonymizedAt: now,
    createdAt,
    updatedAt: now,
  };

  await db.mailDelivery.createMany({
    data: [
      {
        ...base,
        mailName: 'SignIn',
        mailClass: 'auth',
        status: 'sent',
        settledAt: now,
        sentAt: now,
      },
      {
        ...base,
        mailName: 'MemberInvitation',
        mailClass: 'workspace_invitation',
        status: 'failed',
        settledAt: now,
        failedAt: now,
        lastErrorCode: 'transport_failed',
      },
      {
        ...base,
        mailName: 'Mention',
        mailClass: 'notification',
        status: 'queued',
        recipientEmail: 'queued@example.com',
        payload: {},
        retentionState: 'full',
        anonymizedAt: null,
      },
    ],
  });

  await app.login(admin);
  const response = await app.request('post', '/graphql').send({
    query: /* GraphQL */ `
      query AdminMailDeliveries($input: AdminMailDeliveriesInput) {
        adminMailDeliveries(input: $input) {
          window {
            bucket
            effectiveSize
          }
          summary {
            total
            sent
            failed
            queued
            successRate
          }
          byStatus {
            key
            total
            points {
              bucket
              count
            }
          }
          byType {
            key
            total
          }
          byOutcome {
            key
            total
          }
        }
      }
    `,
    variables: {
      input: {
        hours: 24,
      },
    },
  });

  t.is(response.status, 200);
  t.falsy(response.body.errors);
  const analytics = response.body.data.adminMailDeliveries;
  t.is(analytics.window.bucket, 'Hour');
  t.is(analytics.window.effectiveSize, 24);
  t.like(analytics.summary, {
    total: 3,
    sent: 1,
    failed: 1,
    queued: 1,
    successRate: 0.5,
  });
  t.true(
    analytics.byStatus.some((series: { key: string; total: number }) => {
      return series.key === 'sent' && series.total === 1;
    })
  );
  const sent = analytics.byStatus.find(
    (series: { key: string; points: { bucket: string; count: number }[] }) =>
      series.key === 'sent'
  );
  t.deepEqual(
    sent?.points.filter((point: { count: number }) => point.count > 0),
    [{ bucket: createdAt.toISOString(), count: 1 }]
  );
  t.true(
    analytics.byType.some(
      (series: { key: string; total: number }) =>
        series.key === 'workspace_invitation' && series.total === 1
    )
  );
  t.true(
    analytics.byOutcome.some(
      (series: { key: string; total: number }) =>
        series.key === 'pending' && series.total === 1
    )
  );
});

test('adminMailDeliveries uses day buckets for seven day window', async t => {
  const admin = await app.create(Mockers.User, {
    feature: 'administrator',
  });

  await app.login(admin);
  const response = await app.request('post', '/graphql').send({
    query: /* GraphQL */ `
      query AdminMailDeliveries($input: AdminMailDeliveriesInput) {
        adminMailDeliveries(input: $input) {
          window {
            bucket
            effectiveSize
          }
        }
      }
    `,
    variables: {
      input: {
        hours: 168,
      },
    },
  });

  t.is(response.status, 200);
  t.falsy(response.body.errors);
  t.like(response.body.data.adminMailDeliveries.window, {
    bucket: 'Day',
    effectiveSize: 7,
  });
});

test('adminMailDeliveries rejects unsupported window sizes', async t => {
  const admin = await app.create(Mockers.User, {
    feature: 'administrator',
  });

  await app.login(admin);
  const response = await app.request('post', '/graphql').send({
    query: /* GraphQL */ `
      query AdminMailDeliveries($input: AdminMailDeliveriesInput) {
        adminMailDeliveries(input: $input) {
          window {
            requestedSize
          }
        }
      }
    `,
    variables: {
      input: {
        hours: 48,
      },
    },
  });

  t.is(response.status, 200);
  t.truthy(response.body.errors);
  t.regex(
    response.body.errors[0].message,
    /Mail delivery analytics window must be 24 or 168 hours/
  );
});
