/// <reference types="../src/global.d.ts" />

import { TestingModule } from '@nestjs/testing';
import ava, { type TestFn } from 'ava';

import { AuthService } from '../src/core/auth';
import {
  QuotaManagementService,
  QuotaModule,
  Quotas,
  QuotaService,
  QuotaType,
} from '../src/core/quota';
import { StorageModule } from '../src/core/storage';
import { createTestingModule } from './utils';

const test = ava as TestFn<{
  auth: AuthService;
  quota: QuotaService;
  storageQuota: QuotaManagementService;
  module: TestingModule;
}>;

test.beforeEach(async t => {
  const module = await createTestingModule({
    imports: [StorageModule, QuotaModule],
  });

  const quota = module.get(QuotaService);
  const storageQuota = module.get(QuotaManagementService);
  const auth = module.get(AuthService);

  t.context.module = module;
  t.context.quota = quota;
  t.context.storageQuota = storageQuota;
  t.context.auth = auth;
});

test.afterEach.always(async t => {
  await t.context.module.close();
});

test('should be able to set quota', async t => {
  const { auth, quota } = t.context;

  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await quota.getUserQuota(u1.id);
  t.truthy(q1, 'should have quota');
  t.is(q1?.feature.name, QuotaType.FreePlanV1, 'should be free plan');
  t.is(q1?.feature.version, 2, 'should be version 2');

  await quota.switchUserQuota(u1.id, QuotaType.ProPlanV1);

  const q2 = await quota.getUserQuota(u1.id);
  t.is(q2?.feature.name, QuotaType.ProPlanV1, 'should be pro plan');

  const fail = quota.switchUserQuota(u1.id, 'not_exists_plan_v1' as QuotaType);
  await t.throwsAsync(fail, { instanceOf: Error }, 'should throw error');
});

test('should be able to check storage quota', async t => {
  const { auth, quota, storageQuota } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await storageQuota.getUserQuota(u1.id);
  t.is(q1?.blobLimit, Quotas[3].configs.blobLimit, 'should be free plan');
  t.is(q1?.storageQuota, Quotas[3].configs.storageQuota, 'should be free plan');

  await quota.switchUserQuota(u1.id, QuotaType.ProPlanV1);
  const q2 = await storageQuota.getUserQuota(u1.id);
  t.is(q2?.blobLimit, Quotas[1].configs.blobLimit, 'should be pro plan');
  t.is(q2?.storageQuota, Quotas[1].configs.storageQuota, 'should be pro plan');
});

test('should be able revert quota', async t => {
  const { auth, quota, storageQuota } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await storageQuota.getUserQuota(u1.id);
  t.is(q1?.blobLimit, Quotas[3].configs.blobLimit, 'should be free plan');
  t.is(q1?.storageQuota, Quotas[3].configs.storageQuota, 'should be free plan');

  await quota.switchUserQuota(u1.id, QuotaType.ProPlanV1);
  const q2 = await storageQuota.getUserQuota(u1.id);
  t.is(q2?.blobLimit, Quotas[1].configs.blobLimit, 'should be pro plan');
  t.is(q2?.storageQuota, Quotas[1].configs.storageQuota, 'should be pro plan');

  await quota.switchUserQuota(u1.id, QuotaType.FreePlanV1);
  const q3 = await storageQuota.getUserQuota(u1.id);
  t.is(q3?.blobLimit, Quotas[3].configs.blobLimit, 'should be free plan');

  const quotas = await quota.getUserQuotas(u1.id);
  t.is(quotas.length, 3, 'should have 3 quotas');
  t.is(quotas[0].feature.name, QuotaType.FreePlanV1, 'should be free plan');
  t.is(quotas[1].feature.name, QuotaType.ProPlanV1, 'should be pro plan');
  t.is(quotas[2].feature.name, QuotaType.FreePlanV1, 'should be free plan');
  t.is(quotas[0].activated, false, 'should be activated');
  t.is(quotas[1].activated, false, 'should be activated');
  t.is(quotas[2].activated, true, 'should be activated');
});
