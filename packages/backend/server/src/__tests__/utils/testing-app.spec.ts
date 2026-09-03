import { Controller, Get, Req } from '@nestjs/common';
import test from 'ava';
import type { Request } from 'express';

import { AuthModule, AuthService } from '../../core/auth';
import { Public } from '../../core/auth/guard';
import { createTestingApp, type TestingApp } from './testing-app';

@Public()
@Controller('/testing-app')
class TestingAppController {
  @Get('/cookies')
  cookies(@Req() request: Request) {
    const rawCookieHeaderCount = request.rawHeaders.reduce(
      (count, header, index) =>
        index % 2 === 0 && header.toLowerCase() === 'cookie'
          ? count + 1
          : count,
      0
    );

    return {
      cookie: request.headers.cookie ?? '',
      rawCookieHeaderCount,
    };
  }
}

let app: TestingApp;

test.before(async () => {
  app = await createTestingApp({
    imports: [AuthModule],
    controllers: [TestingAppController],
  });
});

test.beforeEach(async () => {
  await app.initTestingDB();
});

test.after.always(async () => {
  await app.close();
});

test('withCookies merges auth and additional cookies into one header', async t => {
  const user = await app.signup();

  app.withCookies({ dub_id: 'click_123' });

  const response = await app.GET('/testing-app/cookies').expect(200);
  const cookies = Object.fromEntries(
    response.body.cookie.split('; ').map((cookie: string) => cookie.split('='))
  );

  t.truthy(cookies[AuthService.sessionCookieName]);
  t.is(cookies[AuthService.userCookieName], user.id);
  t.truthy(cookies[AuthService.csrfCookieName]);
  t.is(cookies.dub_id, 'click_123');
  t.is(response.body.rawCookieHeaderCount, 1);
});

test('clearAuth also clears additional cookies', async t => {
  await app.signup();
  app.withCookies({ dub_id: 'click_123' });

  app.clearAuth();

  const response = await app.GET('/testing-app/cookies').expect(200);

  t.false(response.body.cookie.includes('dub_id='));
  t.false(response.body.cookie.includes(`${AuthService.csrfCookieName}=`));
  t.is(response.body.rawCookieHeaderCount, 1);
});
