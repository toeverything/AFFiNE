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
import { EntitlementModule, EntitlementService } from '../index';
import { LegacyEntitlementProjectionService } from '../projection';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  entitlement: EntitlementService;
  projection: LegacyEntitlementProjectionService;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({ imports: [EntitlementModule] });
  t.context.module = module;
  t.context.db = module.get(PrismaClient);
  t.context.models = module.get(Models);
  t.context.entitlement = module.get(EntitlementService);
  t.context.projection = module.get(LegacyEntitlementProjectionService);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('projects user entitlement to legacy user features and subscriptions', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });

  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    status: 'active',
  });
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.AI,
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });
  await t.context.projection.onEntitlementChanged({
    targetType: 'user',
    targetId: user.id,
  });

  t.true(await t.context.models.userFeature.has(user.id, 'pro_plan_v1'));
  t.true(await t.context.models.userFeature.has(user.id, 'unlimited_copilot'));
  t.like(
    await t.context.db.subscription.findUnique({
      where: {
        targetId_plan: { targetId: user.id, plan: SubscriptionPlan.Pro },
      },
    }),
    {
      recurring: SubscriptionRecurring.Yearly,
      status: 'active',
    }
  );

  await t.context.entitlement.revokeCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.AI,
  });
  t.false(await t.context.models.userFeature.has(user.id, 'unlimited_copilot'));
});

test('projects workspace entitlement and readonly state to legacy workspace features', async t => {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: workspace.id,
    plan: SubscriptionPlan.Team,
    recurring: SubscriptionRecurring.Yearly,
    status: 'active',
    quantity: 8,
  });
  await t.context.projection.onEntitlementChanged({
    targetType: 'workspace',
    targetId: workspace.id,
  });

  const teamFeature = await t.context.models.workspaceFeature.get(
    workspace.id,
    'team_plan_v1'
  );
  t.is(teamFeature?.configs.memberLimit, 8);

  await t.context.db.effectiveWorkspaceQuotaState.upsert({
    where: {
      workspaceId: workspace.id,
    },
    create: {
      workspaceId: workspace.id,
      plan: 'free',
      ownerUserId: owner.id,
      usesOwnerQuota: true,
      seatLimit: 3,
      memberCount: 4,
      overcapacityMemberCount: 1,
      blobLimit: BigInt(10),
      storageQuota: BigInt(10),
      usedStorageQuota: BigInt(1),
      historyPeriodSeconds: 7,
      readonly: true,
      readonlyReasons: ['member_overflow'],
      known: true,
      stale: false,
    },
    update: {
      plan: 'free',
      ownerUserId: owner.id,
      usesOwnerQuota: true,
      seatLimit: 3,
      memberCount: 4,
      overcapacityMemberCount: 1,
      blobLimit: BigInt(10),
      storageQuota: BigInt(10),
      usedStorageQuota: BigInt(1),
      historyPeriodSeconds: 7,
      readonly: true,
      readonlyReasons: ['member_overflow'],
      known: true,
      stale: false,
    },
  });
  await t.context.projection.onWorkspaceQuotaStateChanged({
    workspaceId: workspace.id,
  });

  t.true(
    await t.context.models.workspaceFeature.has(
      workspace.id,
      'quota_exceeded_readonly_workspace_v1'
    )
  );
});

test('installed license scanner never trusts quantity without raw license', async t => {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  await t.context.db.installedLicense.create({
    data: {
      key: 'legacy-key',
      workspaceId: workspace.id,
      quantity: 100,
      recurring: SubscriptionRecurring.Yearly,
      validateKey: '',
      validatedAt: new Date(),
    },
  });

  await t.context.projection.scanInstalledLicenses();

  const entitlement = await t.context.db.entitlement.findFirst({
    where: {
      source: 'selfhost_license',
      subjectId: 'legacy-key',
    },
  });
  t.is(entitlement?.status, 'needs_reupload');
  t.is(entitlement?.quantity, null);
});

test.serial(
  'selfhosted legacy projection ignores unknown entitlements',
  async t => {
    const previousDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
    // @ts-expect-error test mutates env singleton for deployment-specific projection semantics
    globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
    try {
      const user = await t.context.models.user.create({
        email: `${randomUUID()}@affine.pro`,
      });
      await t.context.db.entitlement.create({
        data: {
          targetType: 'user',
          targetId: user.id,
          source: 'cloud_subscription',
          plan: 'ai',
          status: 'active',
          subjectId: `forged-ai:${user.id}`,
        },
      });

      await t.context.projection.onEntitlementChanged({
        targetType: 'user',
        targetId: user.id,
      });

      t.false(
        await t.context.models.userFeature.has(user.id, 'unlimited_copilot')
      );
      t.is(
        await t.context.db.subscription.count({ where: { targetId: user.id } }),
        0
      );
    } finally {
      // @ts-expect-error restore mutable test env singleton
      globalThis.env.DEPLOYMENT_TYPE = previousDeploymentType;
    }
  }
);

test('backfill marks selfhost team subscriptions as needing license revalidation', async t => {
  await t.context.db.subscription.create({
    data: {
      targetId: 'license-key-target',
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      start: new Date(),
    },
  });

  await t.context.projection.backfillEntitlementsAndQuotaStates();

  t.like(
    await t.context.db.entitlement.findFirstOrThrow({
      where: {
        source: 'selfhost_license',
        subjectId: 'license-key-target',
      },
    }),
    {
      targetType: 'instance',
      targetId: 'license-key-target',
      plan: 'selfhost_team',
      status: 'needs_reupload',
    }
  );
});

test('backfill removes dangling legacy subscriptions and entitlements', async t => {
  await t.context.db.subscription.createMany({
    data: [
      {
        targetId: randomUUID(),
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Yearly,
        status: SubscriptionStatus.Active,
        start: new Date(),
      },
      {
        targetId: randomUUID(),
        plan: SubscriptionPlan.Team,
        recurring: SubscriptionRecurring.Yearly,
        status: SubscriptionStatus.Active,
        start: new Date(),
      },
    ],
  });
  await t.context.db.entitlement.createMany({
    data: [
      {
        targetType: 'user',
        targetId: randomUUID(),
        source: 'cloud_subscription',
        plan: 'pro',
        status: 'active',
        subjectId: randomUUID(),
      },
      {
        targetType: 'workspace',
        targetId: randomUUID(),
        source: 'cloud_subscription',
        plan: 'team',
        status: 'active',
        subjectId: randomUUID(),
      },
    ],
  });

  await t.context.projection.backfillEntitlementsAndQuotaStates();

  t.is(await t.context.db.subscription.count(), 0);
  t.is(await t.context.db.entitlement.count(), 0);
});

test('shadow backfill preserves legacy rows and records provider facts', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const paidAiUser = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);
  const danglingTargetId = randomUUID();

  await t.context.db.subscription.createMany({
    data: [
      {
        targetId: user.id,
        stripeSubscriptionId: 'sub_ai_trial',
        plan: SubscriptionPlan.AI,
        recurring: SubscriptionRecurring.Yearly,
        status: SubscriptionStatus.Active,
        start: new Date('2026-01-01T00:00:00.000Z'),
        trialStart: new Date('2026-01-01T00:00:00.000Z'),
        trialEnd: new Date('2026-01-08T00:00:00.000Z'),
      },
      {
        targetId: paidAiUser.id,
        stripeSubscriptionId: 'sub_ai_paid',
        plan: SubscriptionPlan.AI,
        recurring: SubscriptionRecurring.Yearly,
        status: SubscriptionStatus.Active,
        start: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        targetId: danglingTargetId,
        plan: SubscriptionPlan.Pro,
        recurring: SubscriptionRecurring.Yearly,
        status: SubscriptionStatus.Active,
        start: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });
  await t.context.db.invoice.create({
    data: {
      stripeInvoiceId: 'in_backfill_lifetime',
      targetId: user.id,
      currency: 'usd',
      amount: 9999,
      status: 'paid',
      reason: 'subscription_create',
    },
  });
  await t.context.db.installedLicense.create({
    data: {
      key: 'shadow-license-key',
      workspaceId: workspace.id,
      quantity: 3,
      recurring: SubscriptionRecurring.Yearly,
      validateKey: 'shadow-validate-key',
      validatedAt: new Date(),
    },
  });

  await t.context.projection.shadowBackfillEntitlementsAndQuotaStates();

  t.truthy(
    await t.context.db.subscription.findFirst({
      where: { targetId: danglingTargetId },
    })
  );
  t.like(
    await t.context.db.providerSubscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: 'stripe',
          externalSubscriptionId: 'sub_ai_trial',
        },
      },
    }),
    {
      targetType: 'user',
      targetId: user.id,
      plan: SubscriptionPlan.AI,
      status: SubscriptionStatus.Active,
    }
  );
  t.truthy(
    await t.context.db.subscriptionTrialUsage.findUnique({
      where: {
        targetType_targetId_plan: {
          targetType: 'user',
          targetId: user.id,
          plan: SubscriptionPlan.AI,
        },
      },
    })
  );
  t.falsy(
    await t.context.db.subscriptionTrialUsage.findUnique({
      where: {
        targetType_targetId_plan: {
          targetType: 'user',
          targetId: paidAiUser.id,
          plan: SubscriptionPlan.AI,
        },
      },
    })
  );
  t.like(
    await t.context.db.paymentEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: 'stripe',
          externalEventId: 'stripe_invoice:in_backfill_lifetime',
        },
      },
    }),
    {
      targetId: user.id,
      externalInvoiceId: 'in_backfill_lifetime',
      amount: 9999,
      processingStatus: 'processed',
    }
  );
  t.false(
    await t.context.models.workspaceFeature.has(workspace.id, 'team_plan_v1')
  );
});

test('key based selfhost entitlements without raw payload need reupload', async t => {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  await t.context.entitlement.upsertFromSelfhostLicense({
    workspaceId: workspace.id,
    licenseKey: 'remote-key',
    recurring: SubscriptionRecurring.Yearly,
    quantity: 5,
    validateKey: 'validate-key',
    expiresAt: new Date(Date.now() + 3600_000),
  });

  await t.context.projection.scanInstalledLicenses();

  t.like(
    await t.context.db.entitlement.findFirstOrThrow({
      where: { source: 'selfhost_license', subjectId: 'remote-key' },
    }),
    { status: 'needs_reupload', quantity: null }
  );
});

test('revoked selfhost entitlement removes installed license projection', async t => {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  await t.context.db.entitlement.create({
    data: {
      targetType: 'workspace',
      targetId: workspace.id,
      source: 'selfhost_license',
      plan: 'selfhost_team',
      status: 'active',
      subjectId: 'revoked-key',
      quantity: 5,
      signedPayload: Buffer.from('signed-license-payload'),
      metadata: {
        recurring: SubscriptionRecurring.Yearly,
        validateKey: 'validate-key',
      },
      expiresAt: new Date(Date.now() + 3600_000),
      validatedAt: new Date(),
    },
  });
  await t.context.db.installedLicense.create({
    data: {
      key: 'revoked-key',
      workspaceId: workspace.id,
      quantity: 5,
      recurring: SubscriptionRecurring.Yearly,
      validateKey: 'validate-key',
      validatedAt: new Date(),
      license: Buffer.from('signed-license-payload'),
    },
  });

  await t.context.entitlement.revokeBySubject(
    'selfhost_license',
    'revoked-key'
  );

  t.falsy(
    await t.context.db.installedLicense.findUnique({
      where: { workspaceId: workspace.id },
    })
  );
});

test('installed license projection uses explicit entitlement status priority', async t => {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  await t.context.db.entitlement.createMany({
    data: [
      {
        targetType: 'workspace',
        targetId: workspace.id,
        source: 'selfhost_license',
        plan: 'selfhost_team',
        status: 'expired',
        subjectId: 'expired-key',
        quantity: 5,
        metadata: {
          recurring: SubscriptionRecurring.Yearly,
          validateKey: 'expired-validate-key',
        },
        expiresAt: new Date(Date.now() - 3600_000),
        validatedAt: new Date(),
      },
      {
        targetType: 'workspace',
        targetId: workspace.id,
        source: 'selfhost_license',
        plan: 'selfhost_team',
        status: 'grace',
        subjectId: 'grace-key',
        quantity: 6,
        metadata: {
          recurring: SubscriptionRecurring.Yearly,
          validateKey: 'grace-validate-key',
        },
        expiresAt: new Date(Date.now() - 1800_000),
        graceUntil: new Date(Date.now() + 3600_000),
        validatedAt: new Date(),
      },
    ],
  });

  await t.context.projection.onEntitlementChanged({
    targetType: 'workspace',
    targetId: workspace.id,
  });

  const installedLicense =
    await t.context.db.installedLicense.findUniqueOrThrow({
      where: { workspaceId: workspace.id },
    });
  t.is(installedLicense.key, 'grace-key');
  t.is(installedLicense.quantity, 6);
  t.is(installedLicense.validateKey, 'grace-validate-key');
});

test.serial(
  'selfhosted projection does not trust non-null signed payload',
  async t => {
    const previousDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
    // @ts-expect-error test mutates env singleton for deployment-specific projection semantics
    globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
    try {
      const owner = await t.context.models.user.create({
        email: `${randomUUID()}@affine.pro`,
      });
      const workspace = await t.context.models.workspace.create(owner.id);

      await t.context.db.entitlement.create({
        data: {
          targetType: 'workspace',
          targetId: workspace.id,
          source: 'selfhost_license',
          plan: 'selfhost_team',
          status: 'active',
          subjectId: 'forged-key',
          quantity: 100,
          signedPayload: Buffer.from('not-a-valid-license'),
          metadata: {
            recurring: SubscriptionRecurring.Yearly,
            validateKey: 'validate-key',
          },
          expiresAt: new Date(Date.now() + 3600_000),
          validatedAt: new Date(),
        },
      });

      await t.context.projection.onEntitlementChanged({
        targetType: 'workspace',
        targetId: workspace.id,
      });

      t.falsy(
        await t.context.models.workspaceFeature.get(
          workspace.id,
          'team_plan_v1'
        )
      );
      t.falsy(
        await t.context.db.installedLicense.findUnique({
          where: { workspaceId: workspace.id },
        })
      );
    } finally {
      // @ts-expect-error restore mutable test env singleton
      globalThis.env.DEPLOYMENT_TYPE = previousDeploymentType;
    }
  }
);
