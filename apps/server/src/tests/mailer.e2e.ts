/// <reference types="../global.d.ts" />
// This test case is for testing the mailer service.
// Please use local SMTP server for testing.
// See: https://github.com/mailhog/MailHog
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { ConfigModule } from '../config';
import { GqlModule } from '../graphql.module';
import { MetricsModule } from '../metrics';
import { AuthModule } from '../modules/auth';
import { AuthService } from '../modules/auth/service';
import { PrismaModule } from '../prisma';
import { RateLimiterModule } from '../throttler';

let auth: AuthService;
let module: TestingModule;
let skip = false;

test.before(async () => {
  try {
    const response = await fetch('http://localhost:8025/api/v2/messages');
    if (!response.ok && !process.env.CI) {
      console.warn('local mail not found, skip the mailer.e2e.ts');
      skip = true;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.cause as any)?.code === 'ECONNREFUSED' &&
      !process.env.CI
    ) {
      console.warn('local mail not found, skip the mailer.e2e.ts');
      skip = true;
    }
  }
});

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
});

test.beforeEach(async () => {
  module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        auth: {
          accessTokenExpiresIn: 1,
          refreshTokenExpiresIn: 1,
          leeway: 1,
        },
      }),
      PrismaModule,
      GqlModule,
      AuthModule,
      MetricsModule,
      RateLimiterModule,
    ],
  }).compile();
  auth = module.get(AuthService);
});

test.afterEach(async () => {
  await module.close();
});

const getCurrentMailMessageCount = async () => {
  const response = await fetch('http://localhost:8025/api/v2/messages');
  const data = await response.json();
  return data.total;
};

const getLatestMailMessage = async () => {
  const response = await fetch('http://localhost:8025/api/v2/messages');
  const data = await response.json();
  return data.items[0];
};

test('should include callbackUrl in sending email', async t => {
  if (skip) {
    return t.pass();
  }
  await auth.signUp('Alex Yang', 'alexyang@example.org', '123456');
  for (const fn of [
    'sendSetPasswordEmail',
    'sendChangeEmail',
    'sendChangePasswordEmail',
  ] as const) {
    const prev = await getCurrentMailMessageCount();
    await auth[fn]('alexyang@example.org', 'https://test.com/callback');
    const current = await getCurrentMailMessageCount();
    const mail = await getLatestMailMessage();
    t.regex(
      mail.Content.Body,
      /https:\/\/test.com\/callback/,
      `should include callbackUrl when calling ${fn}`
    );
    t.is(current, prev + 1, `calling ${fn}`);
  }
  return;
});
