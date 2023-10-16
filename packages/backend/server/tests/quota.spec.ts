/// <reference types="../src/global.d.ts" />

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';

import { ConfigModule } from '../src/config';
import { MetricsModule } from '../src/metrics';
import { AuthModule } from '../src/modules/auth';
import { AuthService } from '../src/modules/auth/service';
import { QuotaModule, QuotaService } from '../src/modules/quota';
import { PrismaModule } from '../src/prisma';
import { RateLimiterModule } from '../src/throttler';

const test = ava as TestFn<{
  auth: AuthService;
  quota: QuotaService;
  app: TestingModule;
}>;

// cleanup database before each test
test.beforeEach(async () => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        auth: {
          accessTokenExpiresIn: 1,
          refreshTokenExpiresIn: 1,
          leeway: 1,
        },
        host: 'example.org',
        https: true,
      }),
      PrismaModule,
      AuthModule,
      QuotaModule,
      MetricsModule,
      RateLimiterModule,
    ],
  }).compile();
  const quota = module.get(QuotaService);
  const auth = module.get(AuthService);
  t.context.app = module;
  t.context.quota = quota;
  t.context.auth = auth;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should be able to set quota', async t => {
  const { auth, quota } = t.context;

  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await quota.getQuotaByUser(u1.id);
  t.truthy(q1, 'should have quota');
  t.is(q1?.feature.feature, 'free_plan_v1', 'should be free plan');

  await quota.switchQuotaByUser(u1.id, 'pro_plan_v1');

  const q2 = await quota.getQuotaByUser(u1.id);
  t.is(q2?.feature.feature, 'pro_plan_v1', 'should be pro plan');

  const fail = quota.switchQuotaByUser(u1.id, 'not_exists_plan_v1');
  await t.throwsAsync(fail, { instanceOf: Error }, 'should throw error');
});
