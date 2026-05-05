import { createHash, randomUUID } from 'node:crypto';

import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import ava, { type ExecutionContext, type TestFn } from 'ava';
import Sinon from 'sinon';

import { Cache, CryptoHelper } from '../../base';
import { Models, WorkspaceRole } from '../../models';
import { CopilotAccessPolicy } from '../../plugins/copilot/access';
import { ByokService } from '../../plugins/copilot/byok';
import {
  ByokKeyStorage,
  ByokKeyTestStatus,
  ByokProvider,
} from '../../plugins/copilot/byok/types';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  models: Models;
  db: PrismaClient;
  access: CopilotAccessPolicy;
  byok: ByokService;
  crypto: CryptoHelper;
  cache: Cache;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.module = module;
  t.context.models = module.get(Models);
  t.context.db = module.get(PrismaClient);
  t.context.access = module.get(CopilotAccessPolicy);
  t.context.byok = module.get(ByokService);
  t.context.crypto = module.get(CryptoHelper);
  t.context.cache = module.get(Cache);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
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

type ByokMatrixCase = {
  name: string;
  role: WorkspaceRole;
  team?: boolean;
  ownerPlan?: boolean;
  actorPlan?: boolean;
  settings: {
    entitled: boolean;
    serverEntitled: boolean;
    localEntitled: boolean;
  };
  canConfigureServer: boolean;
  canConfigureLocal: boolean;
};

async function createByokMatrixWorkspace(
  t: ExecutionContext<Context>,
  input: Pick<ByokMatrixCase, 'role' | 'team' | 'ownerPlan' | 'actorPlan'>
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
    await t.context.models.workspaceFeature.add(
      workspace.id,
      'team_plan_v1',
      'test'
    );
  }
  if (input.ownerPlan) {
    await t.context.models.userFeature.add(owner.id, 'pro_plan_v1', 'test');
  }
  if (input.actorPlan && actor.id !== owner.id) {
    await t.context.models.userFeature.add(actor.id, 'pro_plan_v1', 'test');
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
    name: 'admin in owner-backed personal workspace',
    role: WorkspaceRole.Admin,
    ownerPlan: true,
    settings: { entitled: true, serverEntitled: true, localEntitled: true },
    canConfigureServer: true,
    canConfigureLocal: true,
  },
  {
    name: 'admin with own plan but no owner-backed server entitlement',
    role: WorkspaceRole.Admin,
    actorPlan: true,
    settings: { entitled: true, serverEntitled: false, localEntitled: true },
    canConfigureServer: false,
    canConfigureLocal: true,
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
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');

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

test('local leases are short lived and do not persist keys to server configs', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');

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
      await t.context.models.userFeature.remove(owner.id, 'pro_plan_v1');
    }
    if (matrixCase.revokeTeam) {
      await t.context.models.workspaceFeature.remove(
        workspace.id,
        'team_plan_v1'
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
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');

  const profiles = await t.context.byok.getProfiles({
    workspaceId: randomUUID(),
    userId: user.id,
  });

  t.deepEqual(profiles, []);
});

test('test key failure disables a saved key and success restores it', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');
  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Primary',
    apiKey: 'sk-test-primary',
  });

  const fetch = Sinon.stub(globalThis, 'fetch');
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
    apiKey: 'sk-test-primary',
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
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');
  const key = await t.context.byok.upsertConfig({
    workspaceId: workspace.id,
    userId: user.id,
    provider: ByokProvider.openai,
    storage: ByokKeyStorage.server,
    name: 'Server',
    apiKey: 'sk-server',
  });

  const fetch = Sinon.stub(globalThis, 'fetch').resolves(
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

test('dispatch failure disables server BYOK key by provider id', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');
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
  t.false(disabled.lastError?.includes('sk-dispatch-primary'));
});

test('effective profiles use local lease before server keys and skip disabled keys', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');
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

  const transcriptProfiles = await t.context.access.getByokProfiles({
    workspaceId: workspace.id,
    userId: user.id,
    byokLeaseId: lease.leaseId,
    featureKind: 'transcript',
  });
  t.deepEqual(
    transcriptProfiles.map(profile => profile.type),
    ['gemini']
  );
});

test('capability warnings match server Gemini background coverage', async t => {
  const { user, workspace } = await createUserWorkspace(t);
  await t.context.models.userFeature.add(user.id, 'pro_plan_v1', 'test');

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
    providerId: 'byok-aaaaaaaaaaaa-openai-server-key1',
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
