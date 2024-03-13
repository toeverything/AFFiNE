/// <reference types="../src/global.d.ts" />
// This test case is for testing the mailer service.
// Please use local SMTP server for testing.
// See: https://github.com/mailhog/MailHog
import {
  getCurrentMailMessageCount,
  getLatestMailMessage,
} from '@affine-test/kit/utils/cloud';
import { TestingModule } from '@nestjs/testing';
import ava, { type TestFn } from 'ava';

import { AuthService } from '../src/core/auth/service';
import { ConfigModule } from '../src/fundamentals/config';
import { createTestingModule } from './utils';

const test = ava as TestFn<{
  auth: AuthService;
  module: TestingModule;
  skip: boolean;
}>;

test.beforeEach(async t => {
  t.context.module = await createTestingModule({
    imports: [ConfigModule.forRoot({})],
  });
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
