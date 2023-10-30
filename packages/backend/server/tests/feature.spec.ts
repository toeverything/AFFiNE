/// <reference types="../src/global.d.ts" />

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';

import { ConfigModule } from '../src/config';
import { MetricsModule } from '../src/metrics';
import { AuthModule } from '../src/modules/auth';
import { AuthService } from '../src/modules/auth/service';
import {
  FeatureManagementService,
  FeatureModule,
  FeatureService,
  FeatureType,
} from '../src/modules/features';
import { PrismaModule } from '../src/prisma';
import { RateLimiterModule } from '../src/throttler';

const test = ava as TestFn<{
  auth: AuthService;
  feature: FeatureService;
  early_access: FeatureManagementService;
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
      FeatureModule,
      MetricsModule,
      RateLimiterModule,
    ],
  }).compile();
  const quota = module.get(FeatureService);
  const storageQuota = module.get(FeatureManagementService);
  const auth = module.get(AuthService);
  t.context.app = module;
  t.context.feature = quota;
  t.context.early_access = storageQuota;
  t.context.auth = auth;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should be able to set feature', async t => {
  const { auth, feature } = t.context;

  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const f1 = await feature.getUserFeatures(u1.id);
  t.is(f1.length, 0, 'should be empty');

  await feature.addUserFeature(
    u1.id,
    FeatureType.Feature_EarlyAccess,
    1,
    'test'
  );

  const f2 = await feature.getUserFeatures(u1.id);
  t.is(f2.length, 1, 'should have one feature');
  t.is(
    f2[0].feature.feature,
    FeatureType.Feature_EarlyAccess,
    'should be early access'
  );
});

test('should be able to check early access', async t => {
  const { auth, feature, early_access } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const f1 = await early_access.canEarlyAccess(u1.id);
  t.false(f1, 'should not have early access');

  await early_access.addEarlyAccess(u1.id);
  const f2 = await early_access.canEarlyAccess(u1.id);
  t.true(f2, 'should have early access');

  const f3 = await feature.listFeatureUsers(FeatureType.Feature_EarlyAccess);
  t.is(f3.length, 1, 'should have one user');
  t.is(f3[0].id, u1.id, 'should be the same user');
});

test('should be able revert quota', async t => {
  const { auth, feature, early_access } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const f1 = await early_access.canEarlyAccess(u1.id);
  t.false(f1, 'should not have early access');

  await early_access.addEarlyAccess(u1.id);
  const f2 = await early_access.canEarlyAccess(u1.id);
  t.true(f2, 'should have early access');
  const q1 = await early_access.listEarlyAccess();
  t.is(q1.length, 1, 'should have one user');
  t.is(q1[0].id, u1.id, 'should be the same user');

  await early_access.removeEarlyAccess(u1.id);
  const f3 = await early_access.canEarlyAccess(u1.id);
  t.false(f3, 'should not have early access');
  const q2 = await early_access.listEarlyAccess();
  t.is(q2.length, 0, 'should have no user');

  const q3 = await feature.getUserFeatures(u1.id);
  t.is(q3.length, 1, 'should have 1 feature');
  t.is(
    q3[0].feature.feature,
    FeatureType.Feature_EarlyAccess,
    'should be early access'
  );
  t.is(q3[0].activated, false, 'should be deactivated');
});
