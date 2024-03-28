/// <reference types="../src/global.d.ts" />

import { TestingModule } from '@nestjs/testing';
import type { TestFn } from 'ava';
import ava from 'ava';

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
  quotaManager: QuotaManagementService;
  module: TestingModule;
}>;

test.beforeEach(async t => {
  const module = await createTestingModule({
    imports: [StorageModule, QuotaModule],
  });

  const quota = module.get(QuotaService);
  const quotaManager = module.get(QuotaManagementService);
  const auth = module.get(AuthService);

  t.context.module = module;
  t.context.quota = quota;
  t.context.quotaManager = quotaManager;
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
  t.is(q1?.feature.version, 3, 'should be version 2');

  await quota.switchUserQuota(u1.id, QuotaType.ProPlanV1);

  const q2 = await quota.getUserQuota(u1.id);
  t.is(q2?.feature.name, QuotaType.ProPlanV1, 'should be pro plan');

  const fail = quota.switchUserQuota(u1.id, 'not_exists_plan_v1' as QuotaType);
  await t.throwsAsync(fail, { instanceOf: Error }, 'should throw error');
});

test('should be able to check storage quota', async t => {
  const { auth, quota, quotaManager } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await quotaManager.getUserQuota(u1.id);
  t.is(q1?.blobLimit, Quotas[5].configs.blobLimit, 'should be free plan');
  t.is(q1?.storageQuota, Quotas[5].configs.storageQuota, 'should be free plan');

  await quota.switchUserQuota(u1.id, QuotaType.ProPlanV1);
  const q2 = await quotaManager.getUserQuota(u1.id);
  t.is(q2?.blobLimit, Quotas[1].configs.blobLimit, 'should be pro plan');
  t.is(q2?.storageQuota, Quotas[1].configs.storageQuota, 'should be pro plan');
});

test('should be able revert quota', async t => {
  const { auth, quota, quotaManager } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await quotaManager.getUserQuota(u1.id);
  t.is(q1?.blobLimit, Quotas[5].configs.blobLimit, 'should be free plan');
  t.is(q1?.storageQuota, Quotas[5].configs.storageQuota, 'should be free plan');

  await quota.switchUserQuota(u1.id, QuotaType.ProPlanV1);
  const q2 = await quotaManager.getUserQuota(u1.id);
  t.is(q2?.blobLimit, Quotas[1].configs.blobLimit, 'should be pro plan');
  t.is(q2?.storageQuota, Quotas[1].configs.storageQuota, 'should be pro plan');

  await quota.switchUserQuota(u1.id, QuotaType.FreePlanV1);
  const q3 = await quotaManager.getUserQuota(u1.id);
  t.is(q3?.blobLimit, Quotas[5].configs.blobLimit, 'should be free plan');

  const quotas = await quota.getUserQuotas(u1.id);
  t.is(quotas.length, 3, 'should have 3 quotas');
  t.is(quotas[0].feature.name, QuotaType.FreePlanV1, 'should be free plan');
  t.is(quotas[1].feature.name, QuotaType.ProPlanV1, 'should be pro plan');
  t.is(quotas[2].feature.name, QuotaType.FreePlanV1, 'should be free plan');
  t.is(quotas[0].activated, false, 'should be activated');
  t.is(quotas[1].activated, false, 'should be activated');
  t.is(quotas[2].activated, true, 'should be activated');
});

test('should be able to check quota', async t => {
  const { auth, quotaManager } = t.context;
  const u1 = await auth.signUp('DarkSky', 'darksky@example.org', '123456');

  const q1 = await quotaManager.getUserQuota(u1.id);
  const freePlan = Quotas[5].configs;
  t.assert(q1, 'should have quota');
  t.is(q1.blobLimit, freePlan.blobLimit, 'should be free plan');
  t.is(q1.storageQuota, freePlan.storageQuota, 'should be free plan');
  t.is(q1.historyPeriod, freePlan.historyPeriod, 'should be free plan');
  t.is(q1.memberLimit, freePlan.memberLimit, 'should be free plan');
  t.is(
    q1.copilotActionLimit!,
    freePlan.copilotActionLimit!,
    'should be free plan'
  );
});
