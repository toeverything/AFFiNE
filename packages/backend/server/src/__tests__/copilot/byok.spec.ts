import { createHash, randomUUID } from 'node:crypto';

import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import ava, { type ExecutionContext, type TestFn } from 'ava';
import Sinon from 'sinon';

import { Cache, ConfigFactory, CryptoHelper } from '../../base';
import { EntitlementService } from '../../core/entitlement';
import { Models, WorkspaceRole } from '../../models';
import { CopilotAccessPolicy } from '../../plugins/copilot/access';
import { ByokService } from '../../plugins/copilot/byok';
import {
  type ByokFeatureKind,
  ByokKeyStorage,
  ByokKeyTestStatus,
  ByokProvider,
} from '../../plugins/copilot/byok/types';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../plugins/payment/types';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  models: Models;
  db: PrismaClient;
  access: CopilotAccessPolicy;
  byok: ByokService;
  crypto: CryptoHelper;
  cache: Cache;
  entitlement: EntitlementService;
}

const test = ava.serial as TestFn<Context>;
const originalNamespace = globalThis.env.NAMESPACE;
const originalDeploymentType = globalThis.env.DEPLOYMENT_TYPE;

test.before(async t => {
  Object.assign(globalThis.env, {
    NAMESPACE: 'dev',
    DEPLOYMENT_TYPE: 'affine',
  });
  const module = await createTestingModule();
  t.context.module = module;
  t.context.models = module.get(Models);
  t.context.db = module.get(PrismaClient);
  t.context.access = module.get(CopilotAccessPolicy);
  t.context.byok = module.get(ByokService);
  t.context.crypto = module.get(CryptoHelper);
  t.context.cache = module.get(Cache);
  t.context.entitlement = module.get(EntitlementService);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
  Object.assign(globalThis.env, {
    NAMESPACE: originalNamespace,
    DEPLOYMENT_TYPE: originalDeploymentType,
  });
});

async function createUserWorkspace(t: ExecutionContext<Context>) {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(user.id);
  return { user, workspace };
}

function workspaceHash(workspaceId: string) {
  return createHash('sha256').update(workspaceId).digest('hex').slice(0, 12);
}

async function grantUserPlan(
  t: ExecutionContext<Context>,
  userId: string,
  feature: ByokUserPlanFeature = 'pro_plan_v1'
) {
  if (feature === 'unlimited_copilot') {
    await t.context.entitlement.upsertFromCloudSubscription({
      targetId: userId,
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
    });
    return;
  }

  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: userId,
    plan: SubscriptionPlan.Pro,
    recurring:
      feature === 'lifetime_pro_plan_v1'
        ? SubscriptionRecurring.Lifetime
        : SubscriptionRecurring.Monthly,
    status: SubscriptionStatus.Active,
  });
}

async function revokeUserPlan(
  t: ExecutionContext<Context>,
  userId: string,
  feature: ByokUserPlanFeature = 'pro_plan_v1'
) {
  if (feature === 'unlimited_copilot') {
    await t.context.entitlement.revokeCloudSubscription({
      targetId: userId,
      plan: SubscriptionPlan.AI,
    });
    return;
  }

  await t.context.entitlement.revokeCloudSubscription({
    targetId: userId,
    plan: SubscriptionPlan.Pro,
  });
}

async function grantTeamPlan(
  t: ExecutionContext<Context>,
  workspaceId: string
) {
  await t.context.entitlement.upsertFromCloudSubscription({
    targetId: workspaceId,
    plan: SubscriptionPlan.Team,
    recurring: SubscriptionRecurring.Yearly,
    status: SubscriptionStatus.Active,
  });
}

async function revokeTeamPlan(
  t: ExecutionContext<Context>,
  workspaceId: string
) {
  await t.context.entitlement.revokeCloudSubscription({
    targetId: workspaceId,
    plan: SubscriptionPlan.Team,
  });
}

type ByokMatrixCase = {
  name: string;
  role: WorkspaceRole;
  team?: boolean;
  ownerPlan?: boolean;
  ownerPlanFeature?: ByokUserPlanFeature;
  actorPlan?: boolean;
  actorPlanFeature?: ByokUserPlanFeature;
  settings: {
    entitled: boolean;
    serverEntitled: boolean;
    localEntitled: boolean;
  };
  canConfigureServer: boolean;
  canConfigureLocal: boolean;
};

type ByokUserPlanFeature =
  | 'pro_plan_v1'
  | 'lifetime_pro_plan_v1'
  | 'unlimited_copilot';

async function createByokMatrixWorkspace(
  t: ExecutionContext<Context>,
  input: Pick<
    ByokMatrixCase,
    | 'role'
    | 'team'
    | 'ownerPlan'
    | 'ownerPlanFeature'
    | 'actorPlan'
    | 'actorPlanFeature'
  >
) {
  const { user: owner, workspace } = await createUserWorkspace(t);
  const actor =
    input.role === WorkspaceRole.Owner
      ? owner
      : await t.context.models.user.create({
          email: `${randomUUID()}@affine.pro`,
        });

  if (input.role !== WorkspaceRole.Owner) {
    await t.context.models.workspaceUser.set(
      workspace.id,
      actor.id,
      input.role,
      { status: WorkspaceMemberStatus.Accepted }
    );
  }
  if (input.team) {
    await grantTeamPlan(t, workspace.id);
  }
  if (input.ownerPlan) {
    await grantUserPlan(t, owner.id, input.ownerPlanFeature);
  }
  if (input.actorPlan && actor.id !== owner.id) {
    await grantUserPlan(t, actor.id, input.actorPlanFeature);
  }

  return { owner, actor, workspace };
}

const byokManagementMatrix: ByokMatrixCase[] = [
  {
    name: 'owner without plan in a personal workspace',
    role: WorkspaceRole.Owner,
    settings: { entitled: false, serverEntitled: false, localEntitled: false },
    canConfigureServer: false,
    canConfigureLocal: false,
  },
  {
    name: 'owner with BYOK plan in a personal workspace',
    role: WorkspaceRole.Owner,
    ownerPlan: true,
    settings: { entitled: true, serverEntitled: true, localEntitled: true },
    canConfigureServer: true,
    canConfigureLocal: true,
  },
  {
    name: 'owner in team workspace without user plan',
    role: WorkspaceRole.Owner,
    team: true,
    settings: { entitled: true, serverEntitled: true, localEntitled: true },
    canConfigureServer: true,
    canConfigureLocal: true,
  },
  {
    name: 'admin in believer owner-backed personal workspace',
    role: WorkspaceRole.Admin,
    ownerPlan: true,
    ownerPlanFeature: 'unlimited_copilot',
    settings: { entitled: true, serverEntitled: true, localEntitled: true },
    canConfigureServer: true,
    canConfigureLocal: true,
  },
  {
    name: 'admin with own lifetime plan but no owner-backed server entitlement',
    role: WorkspaceRole.Admin,
    actorPlan: true,
    actorPlanFeature: 'lifetime_pro_plan_v1',
    settings: { entitled: true, serverEntitled: false, localEntitled: true },
    canConfigureServer: false,
    canConfigureLocal: true,
  },
  {
    name: 'admin without plan in non-entitled personal workspace',
    role: WorkspaceRole.Admin,
    settings: { entitled: false, serverEntitled: false, localEntitled: false },
    canConfigureServer: false,
    canConfigureLocal: false,
  },
  {
    name: 'admin in team workspace without user plan',
    role: WorkspaceRole.Admin,
    team: true,
    settings: { entitled: true, serverEntitled: true, localEntitled: true },
    canConfigureServer: true,
    canConfigureLocal: true,
  },
  {
    name: 'ordinary member in team workspace without user plan',
    role: WorkspaceRole.Collaborator,
    team: true,
    settings: { entitled: false, serverEntitled: false, localEntitled: false },
    canConfigureServer: false,
    canConfigureLocal: false,
  },
  {
    name: 'ordinary member with own plan',
    role: WorkspaceRole.Collaborator,
    ownerPlan: true,
    actorPlan: true,
    settings: { entitled: false, serverEntitled: false, localEntitled: false },
    canConfigureServer: false,
    canConfigureLocal: false,
  },
];

for (const matrixCase of byokManagementMatrix) {
  test(`BYOK management entitlement: ${matrixCase.name}`, async t => {
    const { actor, workspace } = await createByokMatrixWorkspace(t, matrixCase);
    const settings = await t.context.byok.getSettings(workspace.id, actor.id);

    t.like(settings, matrixCase.settings);

    const serverConfig = t.context.byok.upsertConfig({
      workspaceId: workspace.id,
      userId: actor.id,
      provider: ByokProvider.openai,
      storage: ByokKeyStorage.server,
      name: 'Server',
      apiKey: 'sk-server',
    });
    if (matrixCase.canConfigureServer) {
      t.truthy(await serverConfig);
    } else {
      await t.throwsAsync(serverConfig);
    }

    const localLease = t.context.byok.createLocalLease({
      workspaceId: workspace.id,
      userId: actor.id,
      providers: [
        {
          provider: ByokProvider.openai,
          name: 'Local',
          apiKey: 'sk-local',
        },
      ],
    });
    if (matrixCase.canConfigureLocal) {
      t.truthy(await localLease);
    } else {
      await t.throwsAsync(localLease);
    }
  });
}

test('byok service persists encrypted server keys and never returns plaintext', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const primary = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary',
    description: 'Team key',
    apiKey: 'sk-test-primary',
    sortOrder: 1,
  });
  const backup = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Backup',
    apiKey: 'sk-test-backup',
    sortOrder: 2,
  });
  await t.throwsAsync(
    t.context.byok.upsertConfig({
      workspaceId: workspace.id,
      userId: user.id,
      provider: ByokProvider.openai,
      storage: ByokKeyStorage.server,
      name: 'Primary',
      apiKey: 'sk-test-duplicate',
    })
  );

  t.true(primary.configured);
  t.is(primary.storage, ByokKeyStorage.server);
  t.false(JSON.stringify(primary).includes('sk-test-primary'));

  const row = await t.context.models.copilotWorkspaceByokConfig.get(primary.id);
  t.truthy(row);
  if (!row) {
    return;
  }
  t.not(row.encryptedApiKey, 'sk-test-primary');
  t.is(t.context.crypto.decrypt(row.encryptedApiKey), 'sk-test-primary');

  const reordered = await t.context.byok.reorderConfigs({
    workspaceId: workspace.id,
    userId: user.id,
    storage: ByokKeyStorage.server,
    ids: [backup.id, primary.id],
  });
  t.deepEqual(
    reordered.map(key => [key.id, key.sortOrder]),
    [
      [backup.id, 0],
      [primary.id, 1],
    ]
  );

  const profiles = await t.context.byok.getProfiles({
    workspaceId: workspace.id,
    userId: user.id,
  });
  t.deepEqual(
    profiles.map(profile => profile.id),
    [
      `byok-${workspaceHash(workspace.id)}-openai-${backup.id}`,
      `byok-${workspaceHash(workspace.id)}-openai-${primary.id}`,
    ]
  );
});

test('byok service preserves server key fields during partial updates', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary',
    description: 'Team key',
    apiKey: 'sk-test-primary',
    sortOrder: 3,
    enabled: false,
  });

  await t.context.byok.upsertConfig({
    id: key.id,
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary renamed',
    apiKey: 'sk-test-primary-next',
  });

  const updated = await t.context.models.copilotWorkspaceByokConfig.get(key.id);
  t.truthy(updated);
  if (!updated) {
    return;
  }
  t.is(updated.name, 'Primary renamed');
  t.is(updated.description, 'Team key');
  t.is(
    t.context.crypto.decrypt(updated.encryptedApiKey),
    'sk-test-primary-next'
  );
  t.is(updated.sortOrder, 3);
  t.false(updated.enabled);

  await t.context.byok.upsertConfig({
    id: key.id,
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary renamed',
    description: null,
  });

  const cleared = await t.context.models.copilotWorkspaceByokConfig.get(key.id);
  t.is(cleared?.description, null);
  t.is(cleared?.sortOrder, 3);
  t.false(cleared?.enabled ?? true);
});

test('local leases are short lived and do not persist keys to server configs', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const before = Date.now();
  const lease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local',
      },
    ],
  });
  const reusedLease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local',
      },
    ],
  });
  t.is(reusedLease.leaseId, lease.leaseId);
  const cachedLease = await t.context.cache.get<{
    providers: Array<{ apiKey?: string; encryptedApiKey?: string }>;
  }>(`copilot:byok:lease:${lease.leaseId}`);
  t.truthy(cachedLease);
  t.false(JSON.stringify(cachedLease).includes('sk-local'));
  t.is(cachedLease?.providers[0].apiKey, undefined);
  t.truthy(cachedLease?.providers[0].encryptedApiKey);

  const updatedLease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local-updated',
      },
    ],
  });
  t.not(updatedLease.leaseId, lease.leaseId);

  const lifetime = lease.expiresAt.getTime() - before;
  t.true(lifetime >= 5 * 60 * 1000);
  t.true(lifetime <= 15 * 60 * 1000);
  t.deepEqual(
    await t.context.models.copilotWorkspaceByokConfig.list(workspace.id),
    []
  );

  const profiles = await t.context.byok.getProfiles({
    workspaceId: workspace.id,
    userId: user.id,
    byokLeaseId: lease.leaseId,
  });
  t.deepEqual(
    profiles.map(profile => profile.type),
    ['openai']
  );

  const otherWorkspace = await t.context.models.workspace.create(user.id);
  t.deepEqual(
    await t.context.byok.getProfiles({
      workspaceId: otherWorkspace.id,
      userId: user.id,
      byokLeaseId: lease.leaseId,
    }),
    []
  );

  await t.context.cache.delete(`copilot:byok:lease:${lease.leaseId}`);
  t.deepEqual(
    await t.context.byok.getProfiles({
      workspaceId: workspace.id,
      userId: user.id,
      byokLeaseId: lease.leaseId,
    }),
    []
  );
  const renewedLease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local',
      },
    ],
  });
  t.not(renewedLease.leaseId, lease.leaseId);
});

test('local leases persist normalized custom endpoints', async t => {
  const config = t.context.module.get(ConfigFactory);
  const deploymentType = globalThis.env.DEPLOYMENT_TYPE;
  Object.assign(globalThis.env, { DEPLOYMENT_TYPE: 'selfhosted' });
  t.false(t.context.byok.customEndpointSupported);
  config.override({ copilot: { byok: { allowCustomEndpoint: true } } });
  t.true(t.context.byok.customEndpointSupported);
  t.teardown(() => {
    config.override({ copilot: { byok: { allowCustomEndpoint: false } } });
    Object.assign(globalThis.env, { DEPLOYMENT_TYPE: deploymentType });
  });
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const lease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local',
        endpoint: 'https://api.openai.example/v1/',
      },
    ],
  });
  const reusedLease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local',
        endpoint: 'https://api.openai.example/v1',
      },
    ],
  });

  t.is(reusedLease.leaseId, lease.leaseId);
  const cachedLease = await t.context.cache.get<{
    providers: Array<{ endpoint?: string | null }>;
  }>(`copilot:byok:lease:${lease.leaseId}`);
  t.is(cachedLease?.providers[0]?.endpoint, 'https://api.openai.example/v1');

  const profiles = await t.context.byok.getProfiles({
    workspaceId: workspace.id,
    userId: user.id,
    byokLeaseId: lease.leaseId,
  });
  t.is(
    (profiles[0]!.config as { baseURL?: string }).baseURL,
    'https://api.openai.example/v1'
  );
});

type ByokProfileAvailabilityCase = {
  name: string;
  actorRole: WorkspaceRole;
  ownerPlan?: boolean;
  actorPlan?: boolean;
  team?: boolean;
  createServerKey?: boolean;
  createActorLocalLease?: boolean;
  createOwnerLocalLease?: boolean;
  revokeOwnerPlan?: boolean;
  revokeTeam?: boolean;
  demoteActor?: boolean;
  expectedSources: Array<'server' | 'local'>;
};

const byokProfileAvailabilityMatrix: ByokProfileAvailabilityCase[] = [
  {
    name: 'ordinary members can use server BYOK while the owner is entitled',
    actorRole: WorkspaceRole.Collaborator,
    ownerPlan: true,
    createServerKey: true,
    expectedSources: ['server'],
  },
  {
    name: 'ordinary members can use server BYOK in team workspaces',
    actorRole: WorkspaceRole.Collaborator,
    team: true,
    createServerKey: true,
    expectedSources: ['server'],
  },
  {
    name: 'ordinary members cannot use another user local BYOK lease',
    actorRole: WorkspaceRole.Collaborator,
    ownerPlan: true,
    createOwnerLocalLease: true,
    expectedSources: [],
  },
  {
    name: 'owner-backed server and local BYOK stop after owner plan is removed',
    actorRole: WorkspaceRole.Admin,
    ownerPlan: true,
    createServerKey: true,
    createActorLocalLease: true,
    revokeOwnerPlan: true,
    expectedSources: [],
  },
  {
    name: 'admin local BYOK remains available after owner plan removal when admin is entitled',
    actorRole: WorkspaceRole.Admin,
    ownerPlan: true,
    actorPlan: true,
    createServerKey: true,
    createActorLocalLease: true,
    revokeOwnerPlan: true,
    expectedSources: ['local'],
  },
  {
    name: 'team BYOK stops after team entitlement is removed without user plan',
    actorRole: WorkspaceRole.Admin,
    team: true,
    createServerKey: true,
    createActorLocalLease: true,
    revokeTeam: true,
    expectedSources: [],
  },
  {
    name: 'local BYOK lease stops after an admin is demoted',
    actorRole: WorkspaceRole.Admin,
    actorPlan: true,
    createActorLocalLease: true,
    demoteActor: true,
    expectedSources: [],
  },
];

for (const matrixCase of byokProfileAvailabilityMatrix) {
  test(`BYOK profile availability: ${matrixCase.name}`, async t => {
    const { owner, actor, workspace } = await createByokMatrixWorkspace(t, {
      role: matrixCase.actorRole,
      team: matrixCase.team,
      ownerPlan: matrixCase.ownerPlan,
      actorPlan: matrixCase.actorPlan,
    });

    if (matrixCase.createServerKey) {
      const creator =
        matrixCase.actorRole === WorkspaceRole.Collaborator ? owner : actor;
      await t.context.byok.upsertConfig({
        workspaceId: workspace.id,
        userId: creator.id,
        provider: ByokProvider.openai,
        storage: ByokKeyStorage.server,
        name: 'Server',
        apiKey: 'sk-server',
      });
    }

    let leaseId: string | undefined;
    if (matrixCase.createActorLocalLease) {
      leaseId = (
        await t.context.byok.createLocalLease({
          workspaceId: workspace.id,
          userId: actor.id,
          providers: [
            {
              provider: ByokProvider.openai,
              name: 'Local',
              apiKey: 'sk-local',
            },
          ],
        })
      ).leaseId;
    } else if (matrixCase.createOwnerLocalLease) {
      leaseId = (
        await t.context.byok.createLocalLease({
          workspaceId: workspace.id,
          userId: owner.id,
          providers: [
            {
              provider: ByokProvider.openai,
              name: 'Local',
              apiKey: 'sk-local',
            },
          ],
        })
      ).leaseId;
    }

    if (matrixCase.revokeOwnerPlan) {
      await revokeUserPlan(t, owner.id);
    }
    if (matrixCase.revokeTeam) {
      await revokeTeamPlan(t, workspace.id);
    }
    if (matrixCase.demoteActor) {
      await t.context.models.workspaceUser.set(
        workspace.id,
        actor.id,
        WorkspaceRole.Collaborator,
        { status: WorkspaceMemberStatus.Accepted }
      );
    }

    const profiles = await t.context.byok.getProfiles({
      workspaceId: workspace.id,
      userId: actor.id,
      byokLeaseId: leaseId,
    });

    t.deepEqual(
      profiles.map(profile =>
        profile.id.includes('-local-') ? 'local' : 'server'
      ),
      matrixCase.expectedSources
    );
  });
}

test('BYOK profile availability: local-only workspace does not resolve BYOK profiles', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await grantUserPlan(t, user.id);

  const profiles = await t.context.byok.getProfiles({
    workspaceId: randomUUID(),
    userId: user.id,
  });

  t.deepEqual(profiles, []);
});

test('test key failure disables a saved key and success restores it', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);
  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary',
    apiKey: 'sk-test-primary',
  });

  const fetch = Sinon.stub(t.context.byok as any, 'probeFetch');
  fetch
    .onFirstCall()
    .resolves(
      new Response('{"error":"invalid sk-test-primary"}', { status: 401 })
    );
  fetch.onSecondCall().resolves(new Response('{}', { status: 200 }));
  t.teardown(() => fetch.restore());

  const failed = await t.context.byok.testConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    apiKey: 'sk-test-primary',
    configId: key.id,
  });
  t.false(failed.ok);
  t.is(failed.status, ByokKeyTestStatus.failed);
  t.false(failed.message?.includes('sk-test-primary'));

  const disabled = await t.context.models.copilotWorkspaceByokConfig.get(
    key.id
  );
  t.truthy(disabled);
  if (!disabled) {
    return;
  }
  t.false(disabled.enabled);
  t.is(disabled.disabledReason, 'recent_failure');

  const passed = await t.context.byok.testConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    configId: key.id,
  });
  t.true(passed.ok);
  const restored = await t.context.models.copilotWorkspaceByokConfig.get(
    key.id
  );
  t.truthy(restored);
  if (!restored) {
    return;
  }
  t.true(restored.enabled);
  t.is(restored.disabledReason, null);

  const profiles = await t.context.byok.getProfiles({
    workspaceId: workspace.id,
    userId: user.id,
  });
  t.deepEqual(
    profiles.map(profile => profile.type),
    ['openai']
  );
});

test('local key test does not mutate saved server config', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);
  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Server',
    apiKey: 'sk-server',
  });

  const fetch = Sinon.stub(t.context.byok as any, 'probeFetch').resolves(
    new Response('{"error":"invalid sk-local"}', { status: 401 })
  );
  t.teardown(() => fetch.restore());

  const failed = await t.context.byok.testConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.local,
    apiKey: 'sk-local',
    configId: key.id,
  });
  t.false(failed.ok);

  const unchanged = await t.context.models.copilotWorkspaceByokConfig.get(
    key.id
  );
  t.truthy(unchanged);
  if (!unchanged) {
    return;
  }
  t.true(unchanged.enabled);
  t.is(unchanged.disabledReason, null);
  t.is(unchanged.lastValidationError, null);
});

test('Gemini key test sends key in header and returns safe failure message', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const fetch = Sinon.stub(t.context.byok as any, 'probeFetch').resolves(
    new Response(
      'failed https://generativelanguage.googleapis.com/v1beta/models?key=gemini-secret',
      { status: 401 }
    )
  );
  t.teardown(() => fetch.restore());

  const result = await t.context.byok.testConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.gemini,
    storage: ByokKeyStorage.server,
    apiKey: 'gemini-secret',
  });

  t.false(result.ok);
  t.is(
    fetch.firstCall.args[0],
    'https://generativelanguage.googleapis.com/v1beta/models'
  );
  t.is(
    (fetch.firstCall.args[1]!.headers as Record<string, string>)[
      'x-goog-api-key'
    ],
    'gemini-secret'
  );
  t.deepEqual(fetch.firstCall.args[2]?.allowedHeaders, ['x-goog-api-key']);
  t.false(result.message?.includes('gemini-secret'));
  t.is(result.message, 'Provider rejected the BYOK key.');
});

test('FAL key test uses read-only platform API probe endpoint', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const fetch = Sinon.stub(t.context.byok as any, 'probeFetch').resolves(
    new Response('{}', { status: 200 })
  );
  t.teardown(() => fetch.restore());

  const result = await t.context.byok.testConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.fal,
    storage: ByokKeyStorage.server,
    apiKey: 'fal-secret',
  });

  t.true(result.ok);
  t.is(fetch.firstCall.args[0], 'https://api.fal.ai/v1/models?limit=10');
  t.is(
    (fetch.firstCall.args[1]!.headers as Record<string, string>).Authorization,
    'Key fal-secret'
  );
  t.deepEqual(fetch.firstCall.args[2]?.allowedHeaders, ['Authorization']);
});

test('provider test failures do not return raw provider response body', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);
  const cases = [
    {
      body: 'authorization: Bearer token=a+b%2F==',
      status: 401,
      message: 'Provider rejected the BYOK key.',
    },
    {
      body: 'failed https://example.com/models?token=tok+%2F==&limit=1',
      status: 403,
      message: 'Provider rejected the BYOK key permissions.',
    },
    {
      body: '{"api_key":"key+value==","accessToken":"tok%2Fvalue"}',
      status: 429,
      message: 'Provider rate limit exceeded while testing the key.',
    },
    {
      body: 'Key fal-key+value==',
      status: 500,
      message: 'Provider service is unavailable.',
    },
  ];
  const fetch = Sinon.stub(t.context.byok as any, 'probeFetch');
  for (const [index, matrixCase] of cases.entries()) {
    fetch
      .onCall(index)
      .resolves(new Response(matrixCase.body, { status: matrixCase.status }));
  }
  t.teardown(() => fetch.restore());

  for (const matrixCase of cases) {
    const result = await t.context.byok.testConfig({
      workspaceId: workspace.id,
      userId: user.id,
      provider: ByokProvider.openai,
      storage: ByokKeyStorage.local,
      apiKey: 'submitted-secret',
    });

    t.false(result.ok);
    t.is(result.message, matrixCase.message);
    t.false(result.message?.includes(matrixCase.body));
  }
});

test('dispatch failure disables server BYOK key by provider id', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);
  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary',
    apiKey: 'sk-dispatch-primary',
  });

  await t.context.byok.recordProviderFailure({
    workspaceId: workspace.id,
    providerId: `byok-${workspaceHash(workspace.id)}-openai-${key.id}`,
    featureKind: 'chat',
    error: new Error('401 invalid sk-dispatch-primary'),
  });

  const disabled = await t.context.models.copilotWorkspaceByokConfig.get(
    key.id
  );
  t.truthy(disabled);
  if (!disabled) {
    return;
  }
  t.false(disabled.enabled);
  t.is(disabled.disabledReason, 'recent_failure');
  t.is(disabled.lastError, 'Provider request failed.');
});

test('dispatch accounting ignores provider ids from another workspace hash', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);
  const otherWorkspace = await t.context.models.workspace.create(user.id);
  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary',
    apiKey: 'sk-dispatch-primary',
  });
  const mismatchedProviderId = `byok-${workspaceHash(otherWorkspace.id)}-openai-${key.id}`;

  await t.context.byok.recordProviderFailure({
    workspaceId: workspace.id,
    providerId: mismatchedProviderId,
    featureKind: 'chat',
    error: new Error('401 invalid sk-dispatch-primary'),
  });
  await t.context.byok.recordUsage({
    workspaceId: workspace.id,
    userId: user.id,
    providerId: mismatchedProviderId,
    featureKind: 'chat',
    usage: { total_tokens: 3 },
  });

  const config = await t.context.models.copilotWorkspaceByokConfig.get(key.id);
  t.truthy(config);
  t.true(config?.enabled);
  t.is(config?.lastError, null);
  const usage = await t.context.byok.getUsage(
    workspace.id,
    new Date(Date.now() - 60_000),
    new Date(Date.now() + 60_000)
  );
  t.deepEqual(usage, []);
});

test('effective profiles use local lease before server keys and skip disabled keys', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);
  const serverKey = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Server',
    apiKey: 'sk-server',
  });
  await t.context.models.copilotWorkspaceByokConfig.markFailure(
    workspace.id,
    serverKey.id,
    'recent_failure'
  );
  await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.gemini,
    storage: ByokKeyStorage.server,
    name: 'Gemini',
    apiKey: 'gemini-server',
  });
  const lease = await t.context.byok.createLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local',
        apiKey: 'sk-local',
      },
    ],
  });

  const profiles = await t.context.byok.getProfiles({
    workspaceId: workspace.id,
    userId: user.id,
    byokLeaseId: lease.leaseId,
  });

  t.deepEqual(
    profiles.map(profile => profile.id.includes('-local-')),
    [true, false]
  );
  t.deepEqual(
    profiles.map(profile => profile.type),
    ['openai', 'gemini']
  );

  const serverOnlyFeatureKinds: ByokFeatureKind[] = [
    'transcript',
    'embedding',
    'workspace_indexing',
    'rerank',
  ];
  for (const featureKind of serverOnlyFeatureKinds) {
    const featureProfiles = await t.context.access.getByokProfiles({
      workspaceId: workspace.id,
      userId: user.id,
      byokLeaseId: lease.leaseId,
      featureKind,
    });
    t.deepEqual(
      featureProfiles.map(profile => profile.type),
      ['gemini']
    );
  }
});

test('capability warnings match server Gemini background coverage', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await grantUserPlan(t, user.id);

  const emptySettings = await t.context.byok.getSettings(workspace.id, user.id);
  t.deepEqual(
    emptySettings.warnings.map(warning => warning.featureKind),
    ['transcript', 'workspace_indexing']
  );

  await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.gemini,
    storage: ByokKeyStorage.server,
    name: 'Gemini',
    apiKey: 'gemini-server',
  });

  const coveredSettings = await t.context.byok.getSettings(
    workspace.id,
    user.id
  );
  t.deepEqual(coveredSettings.warnings, []);
  t.deepEqual(coveredSettings.keys[0].capabilities, [
    'Text',
    'Image input',
    'Actions',
    'Image generate',
    'Transcript',
    'Indexing',
  ]);
});

test('usage query only returns byok sources', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await t.context.byok.recordUsage({
    workspaceId: workspace.id,
    userId: user.id,
    providerId: `byok-${workspaceHash(workspace.id)}-openai-server-key1`,
    featureKind: 'chat',
    model: 'gpt-5-mini',
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  });
  await t.context.models.copilotUsage.create({
    workspaceId: workspace.id,
    userId: user.id,
    provider: 'openai',
    providerSource: 'affine_plan',
    featureKind: 'chat',
    totalTokens: 99,
  });

  const usage = await t.context.byok.getUsage(
    workspace.id,
    new Date(Date.now() - 60_000),
    new Date(Date.now() + 60_000)
  );

  t.is(usage.length, 1);
  t.is(usage[0].featureKind, 'chat');
  t.is(usage[0].totalTokens, 3);
});

test('usage query aggregates BYOK usage by day and feature in the database', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  const day = new Date('2026-01-02T08:30:00.000Z');
  await t.context.db.aiUsageEvent.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: user.id,
        provider: 'openai',
        providerSource: 'byok_server',
        featureKind: 'chat',
        totalTokens: 3,
        createdAt: day,
      },
      {
        workspaceId: workspace.id,
        userId: user.id,
        provider: 'openai',
        providerSource: 'byok_server',
        featureKind: 'chat',
        totalTokens: 5,
        createdAt: new Date('2026-01-02T20:10:00.000Z'),
      },
      {
        workspaceId: workspace.id,
        userId: user.id,
        provider: 'gemini',
        providerSource: 'byok_local',
        featureKind: 'transcript',
        totalTokens: 7,
        createdAt: new Date('2026-01-02T21:00:00.000Z'),
      },
      {
        workspaceId: workspace.id,
        userId: user.id,
        provider: 'openai',
        providerSource: 'affine_plan',
        featureKind: 'chat',
        totalTokens: 99,
        createdAt: day,
      },
    ],
  });

  const usage = await t.context.byok.getUsage(
    workspace.id,
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-01-03T00:00:00.000Z')
  );

  t.deepEqual(
    usage.map(point => ({
      date: point.date.toISOString(),
      featureKind: point.featureKind,
      totalTokens: point.totalTokens,
    })),
    [
      {
        date: '2026-01-02T00:00:00.000Z',
        featureKind: 'chat',
        totalTokens: 8,
      },
      {
        date: '2026-01-02T00:00:00.000Z',
        featureKind: 'transcript',
        totalTokens: 7,
      },
    ]
  );
});
