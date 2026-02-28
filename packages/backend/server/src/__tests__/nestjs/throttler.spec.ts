import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import { type Response } from 'supertest';

import { AppModule } from '../../app.module';
import { ConfigModule } from '../../base/config';
import {
  CloudThrottlerGuard,
  SkipThrottle,
  Throttle,
  ThrottlerStorage,
} from '../../base/throttler';
import { Public } from '../../core/auth';
import { createTestingApp, TestingApp } from '../utils';

const test = ava as TestFn<{
  storage: ThrottlerStorage;
  app: TestingApp;
}>;

@UseGuards(CloudThrottlerGuard)
@Throttle()
@Controller('/throttled')
class ThrottledController {
  @Get('/default')
  default() {
    return 'default';
  }

  @Get('/default2')
  default2() {
    return 'default2';
  }

  @Get('/default3')
  @Throttle('default', { limit: 10 })
  default3() {
    return 'default3';
  }

  @Public()
  @Get('/authenticated')
  @Throttle('authenticated')
  none() {
    return 'none';
  }

  @Throttle('strict')
  @Get('/strict')
  strict() {
    return 'strict';
  }

  @Public()
  @SkipThrottle()
  @Get('/skip')
  skip() {
    return 'skip';
  }
}

@UseGuards(CloudThrottlerGuard)
@Controller('/nonthrottled')
class NonThrottledController {
  @Public()
  @SkipThrottle()
  @Get('/skip')
  skip() {
    return 'skip';
  }

  @Public()
  @Get('/default')
  default() {
    return 'default';
  }

  @Public()
  @Throttle('strict')
  @Get('/strict')
  strict() {
    return 'strict';
  }
}

test.before(async t => {
  const app = await createTestingApp({
    imports: [
      ConfigModule.override({
        throttle: {
          throttlers: {
            default: {
              ttl: 60,
              limit: 120,
            },
          },
        },
      }),
      AppModule,
    ],
    controllers: [ThrottledController, NonThrottledController],
  });

  t.context.storage = app.get(ThrottlerStorage);
  t.context.app = app;
});

test.beforeEach(async t => {
  const { app } = t.context;
  await app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

function rateLimitHeaders(res: Response) {
  return {
    limit: res.header['x-ratelimit-limit'],
    remaining: res.header['x-ratelimit-remaining'],
    reset: res.header['x-ratelimit-reset'],
    retryAfter: res.header['retry-after'],
  };
}

test('should be able to prevent requests if limit is reached', async t => {
  const { app } = t.context;

  const stub = Sinon.stub(app.get(ThrottlerStorage), 'increment').resolves({
    timeToExpire: 10,
    totalHits: 21,
    isBlocked: true,
    timeToBlockExpire: 10,
  });
  const res = await app
    .GET('/nonthrottled/strict')
    .expect(HttpStatus.TOO_MANY_REQUESTS);

  const headers = rateLimitHeaders(res);

  t.is(headers.retryAfter, '10');

  stub.restore();
});

// ====== unauthenticated user visits ======
test('should use default throttler for unauthenticated user when not specified', async t => {
  const { app } = t.context;

  const res = await app.GET('/nonthrottled/default').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, '120');
  t.is(headers.remaining, '119');
});

test('should skip throttler for unauthenticated user when specified', async t => {
  const { app } = t.context;

  let res = await app.GET('/nonthrottled/skip').expect(200);

  let headers = rateLimitHeaders(res);

  t.is(headers.limit, undefined!);
  t.is(headers.remaining, undefined!);
  t.is(headers.reset, undefined!);

  res = await app.GET('/throttled/skip').expect(200);

  headers = rateLimitHeaders(res);

  t.is(headers.limit, undefined!);
  t.is(headers.remaining, undefined!);
  t.is(headers.reset, undefined!);
});

test('should use specified throttler for unauthenticated user', async t => {
  const { app } = t.context;

  const res = await app.GET('/nonthrottled/strict').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, '20');
  t.is(headers.remaining, '19');
});

// ==== authenticated user visits ====
test('should not protect unspecified routes', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  const res = await app.GET('/nonthrottled/default').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, undefined!);
  t.is(headers.remaining, undefined!);
  t.is(headers.reset, undefined!);
});

test('should use default throttler for authenticated user when not specified', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  const res = await app.GET('/throttled/default').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, '120');
  t.is(headers.remaining, '119');
});

test('should use same throttler for multiple routes', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  let res = await app.GET('/throttled/default').expect(200);

  let headers = rateLimitHeaders(res);

  t.is(headers.limit, '120');
  t.is(headers.remaining, '119');

  res = await app.GET('/throttled/default2').expect(200);

  headers = rateLimitHeaders(res);

  t.is(headers.limit, '120');
  t.is(headers.remaining, '118');
});

test('should use different throttler if specified', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  let res = await app.GET('/throttled/default').expect(200);

  let headers = rateLimitHeaders(res);

  t.is(headers.limit, '120');
  t.is(headers.remaining, '119');

  res = await app.GET('/throttled/default3').expect(200);

  headers = rateLimitHeaders(res);

  t.is(headers.limit, '10');
  t.is(headers.remaining, '9');
});

test('should skip throttler for authenticated if `authenticated` throttler used', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  const res = await app.GET('/throttled/authenticated').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, undefined!);
  t.is(headers.remaining, undefined!);
  t.is(headers.reset, undefined!);
});

test('should apply `default` throttler for unauthenticated user if `authenticated` throttler used', async t => {
  const { app } = t.context;

  const res = await app.GET('/throttled/authenticated').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, '120');
  t.is(headers.remaining, '119');
});

test('should skip throttler for authenticated user when specified', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  const res = await app.GET('/throttled/skip').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, undefined!);
  t.is(headers.remaining, undefined!);
  t.is(headers.reset, undefined!);
});

test('should use specified throttler for authenticated user', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  const res = await app.GET('/throttled/strict').expect(200);

  const headers = rateLimitHeaders(res);

  t.is(headers.limit, '20');
  t.is(headers.remaining, '19');
});

test('should separate anonymous and authenticated user throttlers', async t => {
  const { app } = t.context;

  const unauthenticatedUserRes = await app
    .GET('/nonthrottled/default')
    .expect(200);
  await app.signupV1('u1@affine.pro');
  const authenticatedUserRes = await app.GET('/throttled/default').expect(200);

  const authenticatedResHeaders = rateLimitHeaders(authenticatedUserRes);
  const unauthenticatedResHeaders = rateLimitHeaders(unauthenticatedUserRes);

  t.is(authenticatedResHeaders.limit, '120');
  t.is(authenticatedResHeaders.remaining, '119');

  t.is(unauthenticatedResHeaders.limit, '120');
  t.is(unauthenticatedResHeaders.remaining, '119');
});
