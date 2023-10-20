/// <reference types="../src/global.d.ts" />

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';

import { ConfigModule } from '../src/config';
import { MetricsModule } from '../src/metrics';
import { AuthModule } from '../src/modules/auth';
import { AuthService } from '../src/modules/auth/service';
import {
  QuotaManagementService,
  QuotaModule,
  QuotaService,
} from '../src/modules/quota';
import { Quotas } from '../src/modules/quota/configure/quota';
import { PrismaModule } from '../src/prisma';
import { StorageModule } from '../src/storage';
import { RateLimiterModule } from '../src/throttler';

const test = ava as TestFn<{
  auth: AuthService;
  quota: QuotaService;
  storageQuota: QuotaManagementService;
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
      StorageModule.forRoot(),
      PrismaModule,
      AuthModule,
      QuotaModule,
      MetricsModule,
      RateLimiterModule,
    ],
  }).compile();
  const quota = module.get(QuotaService);
  const storageQuota = module.get(QuotaManagementService);
  const auth = module.get(AuthService);
  t.context.app = module;
  t.context.quota = quota;
  t.context.storageQuota = storageQuota;
  t.context.auth = auth;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should be able to set quota', async t => {
  const { auth, quota } = t.context;

  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await quota.getUserQuota(u1.id);
  t.truthy(q1, 'should have quota');
  t.is(q1?.feature.feature, 'free_plan_v1', 'should be free plan');

  await quota.switchUserQuota(u1.id, 'pro_plan_v1');

  const q2 = await quota.getUserQuota(u1.id);
  t.is(q2?.feature.feature, 'pro_plan_v1', 'should be pro plan');

  const fail = quota.switchUserQuota(u1.id, 'not_exists_plan_v1');
  await t.throwsAsync(fail, { instanceOf: Error }, 'should throw error');
});

test('should be able to check storage quota', async t => {
  const { auth, quota, storageQuota } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await storageQuota.getUserQuota(u1.id);
  t.is(q1?.blobLimit, Quotas[0].configs.blobLimit, 'should be free plan');
  t.is(q1?.storageQuota, Quotas[0].configs.storageQuota, 'should be free plan');

  await quota.switchUserQuota(u1.id, 'pro_plan_v1');
  const q2 = await storageQuota.getUserQuota(u1.id);
  t.is(q2?.blobLimit, Quotas[1].configs.blobLimit, 'should be pro plan');
  t.is(q2?.storageQuota, Quotas[1].configs.storageQuota, 'should be pro plan');
});

test('should be able revert quota', async t => {
  const { auth, quota, storageQuota } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await storageQuota.getUserQuota(u1.id);
  t.is(q1?.blobLimit, Quotas[0].configs.blobLimit, 'should be free plan');
  t.is(q1?.storageQuota, Quotas[0].configs.storageQuota, 'should be free plan');

  await quota.switchUserQuota(u1.id, 'pro_plan_v1');
  const q2 = await storageQuota.getUserQuota(u1.id);
  t.is(q2?.blobLimit, Quotas[1].configs.blobLimit, 'should be pro plan');
  t.is(q2?.storageQuota, Quotas[1].configs.storageQuota, 'should be pro plan');

  await quota.switchUserQuota(u1.id, 'free_plan_v1');
  const q3 = await storageQuota.getUserQuota(u1.id);
  t.is(q3?.blobLimit, Quotas[0].configs.blobLimit, 'should be free plan');

  const quotas = await quota.getUserQuotas(u1.id);
  t.is(quotas.length, 3, 'should have 3 quotas');
  t.is(quotas[0].feature.feature, 'free_plan_v1', 'should be free plan');
  t.is(quotas[1].feature.feature, 'pro_plan_v1', 'should be pro plan');
  t.is(quotas[2].feature.feature, 'free_plan_v1', 'should be free plan');
  t.is(quotas[0].activated, false, 'should be activated');
  t.is(quotas[1].activated, false, 'should be activated');
  t.is(quotas[2].activated, true, 'should be activated');
});
