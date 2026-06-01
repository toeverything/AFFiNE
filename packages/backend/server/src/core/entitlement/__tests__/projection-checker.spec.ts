import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { Models } from '../../../models';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../../plugins/payment/types';
import {
  EntitlementModule,
  EntitlementProjectionChecker,
  EntitlementService,
} from '../index';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  entitlement: EntitlementService;
  checker: EntitlementProjectionChecker;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({ imports: [EntitlementModule] });
  t.context.module = module;
  t.context.db = module.get(PrismaClient);
  t.context.models = module.get(Models);
  t.context.entitlement = module.get(EntitlementService);
  t.context.checker = module.get(EntitlementProjectionChecker);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('checker distinguishes valid projection from dirty legacy features', async t => {
  const cleanUser = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: cleanUser.id,
    plan: 'pro',
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });

  const dirtyUser = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.models.userFeature.add(
    dirtyUser.id,
    'pro_plan_v1',
    'dirty legacy feature'
  );

  const report = await t.context.checker.checkEntitlementProjection();

  t.is(report.dirtyLegacyUserFeatures, 1);
  t.is(report.missingUserFeatureProjection, 0);
});

test('checker reports missing legacy projection and stale state', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: user.id,
    plan: 'pro',
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });
  await t.context.db.subscription.delete({
    where: { targetId_plan: { targetId: user.id, plan: 'pro' } },
  });
  await t.context.db.effectiveUserQuotaState.update({
    where: { userId: user.id },
    data: {
      staleAfter: new Date('2020-01-01T00:00:00Z'),
    },
  });

  const report = await t.context.checker.checkEntitlementProjection();

  t.is(report.cloudSubscriptionProjectionMissing, 1);
  t.is(report.staleEffectiveUserState, 1);
});

test('checker reports legal legacy facts missing entitlements', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.db.subscription.create({
    data: {
      targetId: user.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      start: new Date(),
    },
  });

  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);
  await t.context.db.installedLicense.create({
    data: {
      key: 'legacy-verifiable-key',
      workspaceId: workspace.id,
      quantity: 5,
      recurring: SubscriptionRecurring.Yearly,
      validateKey: 'validate-key',
      validatedAt: new Date(),
      license: Buffer.from('raw-license'),
    },
  });

  const report = await t.context.checker.checkEntitlementProjection();

  t.is(report.cloudSubscriptionEntitlementMissing, 1);
  t.is(report.selfhostLicenseEntitlementMissing, 1);
});
