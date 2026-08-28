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
} from '../../../plugins/payment/types';
import { EntitlementModule } from '../index';
import { EntitlementService } from '../service';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  service: EntitlementService;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({ imports: [EntitlementModule] });
  t.context.module = module;
  t.context.db = module.get(PrismaClient);
  t.context.models = module.get(Models);
  t.context.service = module.get(EntitlementService);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('upserts admin grant entitlement as commercial source of truth', async t => {
  const owner = await t.context.models.user.create({
    email: 'admin-grant-owner@affine.pro',
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  const entitlement = await t.context.service.upsertAdminGrant({
    targetType: 'workspace',
    targetId: workspace.id,
    plan: 'team',
    quantity: 6,
  });
  const resolved = await t.context.service.resolveWorkspaceEntitlement(
    workspace.id
  );

  t.is(entitlement.source, 'admin_grant');
  t.is(entitlement.plan, 'team');
  t.is(entitlement.quantity, 6);
  t.is(resolved.plan, 'team');
  t.is(resolved.quota.seatLimit, 6);
});

test('admin grant replaces and revokes previous admin grant', async t => {
  const user = await t.context.models.user.create({
    email: 'admin-grant-replace@affine.pro',
  });

  await t.context.service.upsertAdminGrant({
    targetType: 'user',
    targetId: user.id,
    plan: 'lifetime_pro',
  });
  await t.context.service.upsertAdminGrant({
    targetType: 'user',
    targetId: user.id,
    plan: 'pro',
  });

  const [resolved, entitlements] = await Promise.all([
    t.context.service.resolveUserEntitlement(user.id),
    t.context.db.entitlement.findMany({
      where: { source: 'admin_grant', targetId: user.id },
    }),
  ]);

  t.is(resolved.plan, 'pro');
  t.is(
    entitlements.filter(entitlement => entitlement.status === 'active').length,
    1
  );
  t.false(
    entitlements.some(
      entitlement =>
        entitlement.plan === 'lifetime_pro' && entitlement.status === 'active'
    )
  );

  await t.context.service.revokeAdminGrant('user', user.id);
  t.is((await t.context.service.resolveUserEntitlement(user.id)).plan, 'free');
});

test('admin grant rejects self-hosted commercial entitlement without writing', async t => {
  const originalDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
  // @ts-expect-error test mutates env singleton for deployment-specific entitlement semantics
  globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
  const owner = await t.context.models.user.create({
    email: 'admin-grant-selfhost@affine.pro',
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  try {
    await t.throwsAsync(
      t.context.service.upsertAdminGrant({
        targetType: 'workspace',
        targetId: workspace.id,
        plan: 'team',
        quantity: 6,
      }),
      { message: /signed license/ }
    );
    t.is(
      await t.context.db.entitlement.count({
        where: { source: 'admin_grant', targetId: workspace.id },
      }),
      0
    );
  } finally {
    // @ts-expect-error restore mutable test env singleton
    globalThis.env.DEPLOYMENT_TYPE = originalDeploymentType;
  }
});

test('admin grant rejects incompatible target plan without writing', async t => {
  const user = await t.context.models.user.create({
    email: 'admin-grant-invalid@affine.pro',
  });

  await t.context.service.upsertAdminGrant({
    targetType: 'user',
    targetId: user.id,
    plan: 'pro',
  });
  await t.throwsAsync(
    t.context.service.upsertAdminGrant({
      targetType: 'user',
      targetId: user.id,
      plan: 'team',
      quantity: 6,
    }),
    { message: /not configurable/ }
  );

  const active = await t.context.db.entitlement.findMany({
    where: { source: 'admin_grant', targetId: user.id, status: 'active' },
  });
  t.is(active.length, 1);
  t.is(active[0].plan, 'pro');
});

test('upserts cloud subscription entitlements without writing legacy features', async t => {
  const proUser = await t.context.models.user.create({
    email: 'user-pro@affine.pro',
  });
  const aiUser = await t.context.models.user.create({
    email: 'user-ai@affine.pro',
  });
  const owner = await t.context.models.user.create({
    email: 'workspace-owner@affine.pro',
  });
  const teamWorkspace = await t.context.models.workspace.create(owner.id);
  const cases = [
    {
      targetId: proUser.id,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Yearly,
      status: 'active',
      expected: { targetType: 'user', plan: 'pro', status: 'active' },
    },
    {
      targetId: aiUser.id,
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Monthly,
      status: 'trialing',
      expected: { targetType: 'user', plan: 'ai', status: 'active' },
    },
    {
      targetId: teamWorkspace.id,
      plan: SubscriptionPlan.Team,
      recurring: SubscriptionRecurring.Yearly,
      status: 'past_due',
      quantity: 7,
      expected: { targetType: 'workspace', plan: 'team', status: 'grace' },
    },
  ];

  for (const item of cases) {
    const entitlement = await t.context.service.upsertFromCloudSubscription({
      ...item,
      subscriptionId: `${item.targetId}:${item.plan}`,
      start: new Date('2026-05-14T00:00:00Z'),
    });

    t.like(entitlement, item.expected, item.targetId);
  }

  t.is(await t.context.db.entitlement.count(), cases.length);
});

test('revokes cloud subscription entitlement by subject', async t => {
  const user = await t.context.models.user.create({
    email: 'revoke-user@affine.pro',
  });
  const entitlement = await t.context.service.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
    subscriptionId: 'sub_1',
  });

  await t.context.service.revokeCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    subscriptionId: 'sub_1',
  });

  const updated = await t.context.db.entitlement.findUnique({
    where: { id: entitlement.id },
  });
  t.is(updated?.status, 'revoked');
});

test('revokes onetime or revenuecat entitlements using fallback subject', async t => {
  const user = await t.context.models.user.create({
    email: 'fallback-user@affine.pro',
  });
  const entitlement = await t.context.service.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    status: 'active',
  });

  await t.context.service.revokeCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    subscriptionId: 1,
  });

  const updated = await t.context.db.entitlement.findUnique({
    where: { id: entitlement.id },
  });
  t.is(updated?.status, 'revoked');
});

test('resolves higher priority commercial entitlement over ai capability', async t => {
  const user = await t.context.models.user.create({
    email: 'priority-user@affine.pro',
  });
  await t.context.service.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    status: 'active',
  });
  await t.context.service.upsertFromCloudSubscription({
    targetId: user.id,
    plan: SubscriptionPlan.AI,
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });

  const resolved = await t.context.service.resolveUserEntitlement(user.id);
  t.is(resolved.plan, 'pro');
  t.is(resolved.quota.storageQuota, 100 * 1024 * 1024 * 1024);
});

test('ignores expired active entitlements during best entitlement selection', async t => {
  const user = await t.context.models.user.create({
    email: 'expired-user@affine.pro',
  });
  const cases = [
    {
      status: 'active',
      subjectId: 'expired-subscription',
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    },
    {
      status: 'grace',
      subjectId: 'open-ended-grace',
    },
  ];

  for (const item of cases) {
    await t.context.db.entitlement.create({
      data: {
        targetType: 'user',
        targetId: user.id,
        source: 'cloud_subscription',
        plan: 'pro',
        ...item,
      },
    });
  }

  t.falsy(await t.context.service.getBestEntitlement('user', user.id));
  const resolved = await t.context.service.resolveUserEntitlement(user.id);
  t.is(resolved.plan, 'free');
});

test('selfhosted resolution ignores unsigned DB entitlements', async t => {
  const previousDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
  // @ts-expect-error test mutates env singleton for deployment-specific trust boundary
  globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
  try {
    const user = await t.context.models.user.create({
      email: 'forged-user@affine.pro',
    });
    const owner = await t.context.models.user.create({
      email: 'forged-workspace-owner@affine.pro',
    });
    const workspace = await t.context.models.workspace.create(owner.id);
    const cases = [
      {
        targetType: 'user',
        targetId: user.id,
        source: 'cloud_subscription',
        plan: 'ai',
        quantity: null,
      },
      {
        targetType: 'workspace',
        targetId: workspace.id,
        source: 'cloud_subscription',
        plan: 'team',
        quantity: 100,
      },
      {
        targetType: 'workspace',
        targetId: workspace.id,
        source: 'selfhost_license',
        plan: 'selfhost_team',
        quantity: 100,
      },
    ] as const;

    for (const item of cases) {
      await t.context.db.entitlement.create({
        data: {
          ...item,
          status: 'active',
          subjectId: `${item.source}:${item.plan}:${item.targetId}`,
          quantity: item.quantity ?? undefined,
        },
      });
    }

    t.falsy(await t.context.service.getBestEntitlement('user', user.id));
    t.falsy(
      await t.context.service.getBestEntitlement('workspace', workspace.id)
    );

    const userResolved = await t.context.service.resolveUserEntitlement(
      user.id
    );
    const workspaceResolved =
      await t.context.service.resolveWorkspaceEntitlement(workspace.id);

    t.is(userResolved.plan, 'selfhost_free');
    t.is(workspaceResolved.plan, 'selfhost_free');
  } finally {
    // @ts-expect-error restore mutable test env singleton
    globalThis.env.DEPLOYMENT_TYPE = previousDeploymentType;
  }
});
