import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import ava, { ExecutionContext, TestFn } from 'ava';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { EventBus } from '../../../base';
import {
  Models,
  Workspace,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../../models';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
} from '../../../plugins/payment/types';
import { EntitlementModule, EntitlementService } from '../../entitlement';
import { QuotaService } from '../service';
import { QuotaServiceModule } from '../service.module';
import { QuotaStateService } from '../state';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  entitlement: EntitlementService;
  quota: QuotaService;
  state: QuotaStateService;
}

const test = ava.serial as TestFn<Context>;
const ONE_GB = 1024 * 1024 * 1024;
const ONE_DAY_SECONDS = 24 * 60 * 60;
type CaseState = {
  userId?: string;
  workspaceId?: string;
};

test.before(async t => {
  const module = await createTestingModule({
    imports: [EntitlementModule, QuotaServiceModule],
  });
  t.context.module = module;
  t.context.db = module.get(PrismaClient);
  t.context.models = module.get(Models);
  t.context.entitlement = module.get(EntitlementService);
  t.context.quota = module.get(QuotaService);
  t.context.state = module.get(QuotaStateService);
});

test('quota service ignores dirty legacy commercial features', async t => {
  const { owner, workspace } = await createWorkspace(t);
  await t.context.models.userFeature.add(
    owner.id,
    'pro_plan_v1',
    'dirty legacy feature'
  );
  await t.context.models.userFeature.add(
    owner.id,
    'unlimited_copilot',
    'dirty legacy feature'
  );
  await t.context.models.workspaceFeature.add(
    workspace.id,
    'team_plan_v1',
    'dirty legacy feature',
    {
      memberLimit: 100,
    }
  );

  const userQuota = await t.context.quota.getUserQuota(owner.id);
  const workspaceSeats = await t.context.quota.getWorkspaceSeatQuota(
    workspace.id
  );

  t.is(userQuota.name, 'Free');
  t.is(userQuota.copilotActionLimit, 10);
  t.is(workspaceSeats.memberLimit, 3);
});

test('workspace quota state ignores dirty legacy readonly feature', async t => {
  const { workspace } = await createWorkspace(t);
  await t.context.models.workspaceFeature.add(
    workspace.id,
    'quota_exceeded_readonly_workspace_v1',
    'dirty legacy feature'
  );

  const state = await t.context.state.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.false(state.readonly);
  t.deepEqual(state.readonlyReasons, []);
});

test('workspace quota state ignores dirty legacy permission rows', async t => {
  const { workspace } = await createWorkspace(t);
  const member = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.models.workspaceUser.set(
    workspace.id,
    member.id,
    WorkspaceRole.Collaborator,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  await t.context.db.$transaction(async tx => {
    await tx.$executeRaw`
      SELECT set_config('affine.permission_projection.enabled', 'off', true)
    `;
    await tx.workspaceMember.deleteMany({
      where: {
        workspaceId: workspace.id,
        userId: member.id,
      },
    });
  });

  const state = await t.context.state.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.is(state.memberCount, 1);
});

test('quota service exposes history period in seconds', async t => {
  const { owner, workspace } = await createWorkspace(t);
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: owner.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });

  const userState = await t.context.state.reconcileUserQuotaState(owner.id);
  const workspaceState = await t.context.state.reconcileWorkspaceQuotaState(
    workspace.id
  );
  const workspaceQuota = await t.context.quota.getWorkspaceQuota(workspace.id);

  t.is(userState.historyPeriodSeconds, 30 * ONE_DAY_SECONDS);
  t.is(workspaceState.historyPeriodSeconds, 30 * ONE_DAY_SECONDS);
  t.is(workspaceQuota.historyPeriod, 30 * ONE_DAY_SECONDS);
  t.is(
    t.context.quota.formatWorkspaceQuota({
      ...workspaceQuota,
      usedStorageQuota: 0,
      memberCount: 1,
      overcapacityMemberCount: 0,
      usedSize: 0,
    }).historyPeriod,
    '30 days'
  );
});

test('quota state reconcile does not publish unchanged snapshots', async t => {
  const user = await t.context.models.user.create({
    email: 'quota-event-owner@affine.pro',
  });
  await t.context.db.effectiveUserQuotaState.deleteMany({
    where: { userId: user.id },
  });
  const event = t.context.module.get(EventBus);
  let changes = 0;
  event.on('user.quota_state.changed', ({ userId }) => {
    if (userId === user.id) {
      changes += 1;
    }
  });

  await t.context.state.reconcileUserQuotaState(user.id);
  await t.context.state.reconcileUserQuotaState(user.id);

  t.is(changes, 1);
});

test('workspace quota state requires owner from new permission table', async t => {
  const { owner, workspace } = await createWorkspace(t);
  await t.context.db.$transaction(async tx => {
    await tx.$executeRaw`
      SELECT set_config('affine.permission_projection.enabled', 'off', true)
    `;
    await tx.workspaceMember.deleteMany({
      where: {
        workspaceId: workspace.id,
        userId: owner.id,
      },
    });
  });

  await t.throwsAsync(
    t.context.state.reconcileWorkspaceQuotaState(workspace.id),
    { message: 'Workspace owner not found' }
  );
});

test('user quota state aggregates owned storage from new permission table only', async t => {
  const { owner, workspace } = await createWorkspace(t);
  await addBlob(t, workspace, 'blob', ONE_GB);

  const first = await t.context.state.reconcileUserQuotaState(owner.id);
  await t.context.db.$transaction(async tx => {
    await tx.$executeRaw`
      SELECT set_config('affine.permission_projection.enabled', 'off', true)
    `;
    await tx.workspaceMember.deleteMany({
      where: {
        workspaceId: workspace.id,
        userId: owner.id,
      },
    });
  });
  const second = await t.context.state.reconcileUserQuotaState(owner.id);

  t.is(first.usedStorageQuota, BigInt(ONE_GB));
  t.is(second.usedStorageQuota, 0n);
});

test('user quota state keeps ai capability alongside pro entitlement', async t => {
  const { owner } = await createWorkspace(t);
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: owner.id,
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    status: 'active',
  });
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: owner.id,
    plan: SubscriptionPlan.AI,
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });

  const state = await t.context.state.reconcileUserQuotaState(owner.id);
  const quota = await t.context.quota.getUserQuota(owner.id);

  t.is(state.plan, 'pro');
  t.deepEqual(state.flags, { unlimitedCopilot: true });
  t.is(quota.copilotActionLimit, undefined);
});

test('ai entitlement is a capability overlay on free quota', async t => {
  const { owner } = await createWorkspace(t);
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: owner.id,
    plan: SubscriptionPlan.AI,
    recurring: SubscriptionRecurring.Monthly,
    status: 'active',
  });

  const state = await t.context.state.reconcileUserQuotaState(owner.id);
  const quota = await t.context.quota.getUserQuota(owner.id);

  t.is(state.plan, 'free');
  t.deepEqual(state.flags, { unlimitedCopilot: true });
  t.is(quota.name, 'Free');
  t.is(quota.copilotActionLimit, undefined);
});

test('workspace team status ignores dirty legacy feature', async t => {
  const { workspace } = await createWorkspace(t);
  await t.context.models.workspaceFeature.add(
    workspace.id,
    'team_plan_v1',
    'dirty legacy feature',
    {
      memberLimit: 100,
    }
  );

  t.false(await t.context.models.workspace.isTeamWorkspace(workspace.id));

  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: workspace.id,
    plan: SubscriptionPlan.Team,
    recurring: SubscriptionRecurring.Yearly,
    status: 'active',
    quantity: 5,
  });

  t.true(await t.context.models.workspace.isTeamWorkspace(workspace.id));
});

test('selfhosted builtin free has cloud pro quota rights', async t => {
  const previousDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
  // @ts-expect-error test mutates env singleton for deployment-specific quota semantics
  globalThis.env.DEPLOYMENT_TYPE = 'selfhosted';
  try {
    const { owner, workspace } = await createWorkspace(t);

    const userState = await t.context.state.reconcileUserQuotaState(owner.id);
    const userQuota = await t.context.quota.getUserQuota(owner.id);
    const workspaceState = await t.context.state.reconcileWorkspaceQuotaState(
      workspace.id
    );
    const workspaceQuota = await t.context.quota.getWorkspaceQuota(
      workspace.id
    );

    t.is(userState.plan, 'selfhost_free');
    t.is(userState.storageQuota, BigInt(100 * ONE_GB));
    t.is(userQuota.name, 'Pro');
    t.is(userQuota.memberLimit, 10);
    t.is(workspaceState.plan, 'selfhost_free');
    t.is(workspaceQuota.name, 'Pro');
    t.is(workspaceQuota.memberLimit, 10);
  } finally {
    // @ts-expect-error restore mutable test env singleton
    globalThis.env.DEPLOYMENT_TYPE = previousDeploymentType;
  }
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('reconciles quota states from entitlements and business tables', async t => {
  const previousDeploymentType = globalThis.env.DEPLOYMENT_TYPE;
  // @ts-expect-error test mutates env singleton for cloud entitlement semantics
  globalThis.env.DEPLOYMENT_TYPE = 'affine';
  const cases = [
    {
      name: 'owner fallback uses user entitlement and owner storage usage',
      setup: async () => {
        const { owner, workspace } = await createWorkspace(t);
        await t.context.entitlement.upsertFromCloudSubscription({
          targetId: owner.id,
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
          status: 'active',
        });
        await addBlob(t, workspace, 'blob', ONE_GB);

        return { userId: owner.id, workspaceId: workspace.id };
      },
      assert: async ({ userId, workspaceId }: CaseState) => {
        const user = await t.context.state.reconcileUserQuotaState(userId!);
        const workspace = await t.context.state.reconcileWorkspaceQuotaState(
          workspaceId!
        );

        t.is(user.plan, 'pro');
        t.is(user.usedStorageQuota, BigInt(ONE_GB));
        t.true(workspace.usesOwnerQuota);
        t.is(workspace.plan, 'pro');
        t.is(
          (await t.context.quota.getWorkspaceQuota(workspaceId!)).name,
          'Pro'
        );
        t.is(workspace.storageQuota, BigInt(100 * ONE_GB));
        t.is(workspace.usedStorageQuota, BigInt(ONE_GB));
      },
    },
    {
      name: 'team entitlement owns workspace quota',
      setup: async () => {
        const { workspace } = await createWorkspace(t);
        await t.context.entitlement.upsertFromCloudSubscription({
          targetId: workspace.id,
          plan: SubscriptionPlan.Team,
          recurring: SubscriptionRecurring.Yearly,
          status: 'active',
          quantity: 5,
        });

        return { workspaceId: workspace.id };
      },
      assert: async ({ workspaceId }: CaseState) => {
        const workspace = await t.context.state.reconcileWorkspaceQuotaState(
          workspaceId!
        );

        t.false(workspace.usesOwnerQuota);
        t.is(workspace.seatLimit, 5);
        t.is(workspace.storageQuota, BigInt(200 * ONE_GB));
      },
    },
    {
      name: 'overcapacity members set readonly state',
      setup: async () => {
        const { workspace } = await createWorkspace(t);
        await addAcceptedMembers(t, workspace.id, 4);

        return { workspaceId: workspace.id };
      },
      assert: async ({ workspaceId }: CaseState) => {
        const workspace = await t.context.state.reconcileWorkspaceQuotaState(
          workspaceId!
        );

        t.true(workspace.readonly);
        t.deepEqual(workspace.readonlyReasons, ['member_overflow']);
        t.is(workspace.overcapacityMemberCount, 2);
      },
    },
    {
      name: 'storage overflow sets readonly state',
      setup: async () => {
        const { workspace } = await createWorkspace(t);
        for (let index = 0; index < 11; index++) {
          await addBlob(t, workspace, `blob-${index}`, ONE_GB);
        }

        return { workspaceId: workspace.id };
      },
      assert: async ({ workspaceId }: CaseState) => {
        const workspace = await t.context.state.reconcileWorkspaceQuotaState(
          workspaceId!
        );

        t.true(workspace.readonly);
        t.deepEqual(workspace.readonlyReasons, ['storage_overflow']);
        t.is(workspace.usedStorageQuota, BigInt(11 * ONE_GB));
      },
    },
    {
      name: 'expired entitlement falls back to free state',
      setup: async () => {
        const { owner } = await createWorkspace(t);
        await t.context.entitlement.upsertFromCloudSubscription({
          targetId: owner.id,
          plan: SubscriptionPlan.Pro,
          recurring: SubscriptionRecurring.Monthly,
          status: 'canceled',
        });

        return { userId: owner.id };
      },
      assert: async ({ userId }: CaseState) => {
        const user = await t.context.state.reconcileUserQuotaState(userId!);

        t.is(user.plan, 'free');
        t.is(user.sourceEntitlementId, null);
      },
    },
  ];

  try {
    for (const item of cases) {
      await t.context.module.initTestingDB();
      const state = await item.setup();
      await item.assert(state);
    }
  } finally {
    // @ts-expect-error restore mutable test env singleton
    globalThis.env.DEPLOYMENT_TYPE = previousDeploymentType;
  }
});

async function createWorkspace(t: ExecutionContext<Context>) {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  return { owner, workspace };
}

async function addAcceptedMembers(
  t: ExecutionContext<Context>,
  workspaceId: string,
  count: number
) {
  for (let index = 0; index < count; index++) {
    const member = await t.context.models.user.create({
      email: `${randomUUID()}@affine.pro`,
    });
    await t.context.models.workspaceUser.set(
      workspaceId,
      member.id,
      WorkspaceRole.Collaborator,
      {
        status: WorkspaceMemberStatus.Accepted,
      }
    );
  }
}

async function addBlob(
  t: ExecutionContext<Context>,
  workspace: Workspace,
  key: string,
  size: number
) {
  await t.context.models.blob.upsert({
    workspaceId: workspace.id,
    key,
    mime: 'application/octet-stream',
    size,
  });
}
