/// <reference types="../src/global.d.ts" />
// This test case is for testing the mailer service.
// Please use local SMTP server for testing.
// See: https://github.com/mailhog/MailHog
import {
  getCurrentMailMessageCount,
  getLatestMailMessage,
} from '@affine-test/kit/utils/cloud';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';

import { ConfigModule } from '../src/config';
import { GqlModule } from '../src/graphql.module';
import { MetricsModule } from '../src/metrics';
import { AuthModule } from '../src/modules/auth';
import { AuthService } from '../src/modules/auth/service';
import { PrismaModule } from '../src/prisma';
import { RateLimiterModule } from '../src/throttler';

const test = ava as TestFn<{
  auth: AuthService;
  module: TestingModule;
  skip: boolean;
}>;

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
});

test.beforeEach(async t => {
  t.context.module = await Test.createTestingModule({
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
  t.context.auth = t.context.module.get(AuthService);
});

test.afterEach.always(async t => {
  await t.context.module.close();
});

test('should include callbackUrl in sending email', async t => {
  const { auth } = t.context;
  await auth.signUp('Alex Yang', 'alexyang@example.org', '123456');
  for (const fn of [
    'sendSetPasswordEmail',
    'sendChangeEmail',
    'sendChangePasswordEmail',
    'sendVerifyChangeEmail',
  ] as const) {
    const prev = await getCurrentMailMessageCount();
    await auth[fn]('alexyang@example.org', 'https://test.com/callback');
    const current = await getCurrentMailMessageCount();
    const mail = await getLatestMailMessage();
    t.regex(
      mail?.Content?.Body,
      /https:\/\/test.com\/callback/,
      `should include callbackUrl when calling ${fn}`
    );
    t.is(current, prev + 1, `calling ${fn}`);
  }
});
