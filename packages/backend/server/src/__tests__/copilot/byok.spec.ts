import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';

import type { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import type { WorkspaceType } from '../../core/workspaces';
import { Models } from '../../models';
import { WorkspaceByokResolver } from '../../plugins/copilot/byok/resolver';
import { createTestingModule, type TestingModule } from '../utils';

type Context = {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  runtime: BackendRuntimeProvider;
  resolver: WorkspaceByokResolver;
};

const test = ava.serial as TestFn<Context>;
const previousKey = process.env.AFFINE_PRIVATE_KEY;
const { privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const testPrivateKey = privateKey
  .export({
    format: 'pem',
    type: 'pkcs8',
  })
  .toString();

const definition = {
  endpoint: { kind: 'provider_default' },
  models: [
    {
      modelId: 'gpt-4o-mini',
      enabled: true,
      capabilities: [
        {
          input: ['text'],
          output: ['text'],
          features: [],
          attachmentKinds: [],
          attachmentSources: [],
        },
      ],
    },
  ],
};

test.before(async t => {
  process.env.AFFINE_PRIVATE_KEY = testPrivateKey;
  t.context.module = await createTestingModule();
  t.context.db = t.context.module.get(PrismaClient);
  t.context.models = t.context.module.get(Models);
  t.context.runtime = t.context.module.get(BackendRuntimeProvider);
  t.context.resolver = t.context.module.get(WorkspaceByokResolver);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module?.close();
  if (previousKey === undefined) delete process.env.AFFINE_PRIVATE_KEY;
  else process.env.AFFINE_PRIVATE_KEY = previousKey;
});

test('BYOK settings expose the native effective policy', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(user.id);
  const settings = await t.context.resolver.settings(
    {
      id: user.id,
      email: user.email,
      avatarUrl: user.avatarUrl,
      name: user.name,
      disabled: user.disabled,
      hasPassword: null,
      emailVerified: true,
    } satisfies CurrentUser,
    { id: workspace.id } as WorkspaceType
  );
  t.deepEqual(settings.policy, await t.context.runtime.getByokPolicy());
});

test('native BYOK runtime owns multi-model profile CAS, ordering, and credential rotation', async t => {
  t.is(typeof BackendRuntimeProvider.prototype.probeByokProfile, 'function');
  t.false('runProviderProbe' in BackendRuntimeProvider.prototype);

  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(user.id);
  const created = await t.context.runtime.createByokProfile({
    workspaceId: workspace.id,
    provider: 'openai',
    name: 'OpenAI',
    description: undefined,
    credential: 'first-secret',
    definition,
    enabled: true,
    actorUserId: user.id,
  });
  t.is(created.definition.models[0].modelId, 'gpt-4o-mini');
  t.is(created.validation, undefined);
  t.false(JSON.stringify(created).includes('first-secret'));
  const stored = await t.context.db.aiWorkspaceByokConfig.findUniqueOrThrow({
    where: { id: created.profileId },
  });
  t.not(stored.encryptedApiKey, 'first-secret');
  t.false(stored.encryptedApiKey.includes('first-secret'));

  const multiModelDefinition = {
    ...definition,
    models: [
      definition.models[0],
      {
        modelId: 'text-embedding-3-small',
        enabled: false,
        capabilities: [
          {
            input: ['text'],
            output: ['embedding'],
            features: [],
            attachmentKinds: [],
            attachmentSources: [],
          },
        ],
      },
    ],
  };
  const replaced = await t.context.runtime.replaceByokProfile({
    workspaceId: workspace.id,
    profileId: created.profileId,
    expectedRevision: created.revision,
    name: 'OpenAI models',
    definition: multiModelDefinition,
    enabled: true,
    actorUserId: user.id,
  });
  t.is(replaced.revision, created.revision + 1);
  t.is(replaced.definition.models.length, 2);
  t.false(replaced.definition.models[1].enabled);

  const conflict = await t.throwsAsync(
    t.context.runtime.replaceByokProfile({
      workspaceId: workspace.id,
      profileId: created.profileId,
      expectedRevision: created.revision,
      name: 'stale update',
      definition,
      enabled: true,
      actorUserId: user.id,
    })
  );
  t.regex(conflict.message, /byok_revision_conflict/);

  const rotated = await t.context.runtime.rotateByokCredential({
    workspaceId: workspace.id,
    profileId: created.profileId,
    expectedRevision: replaced.revision,
    credential: 'second-secret',
    actorUserId: user.id,
  });
  t.is(rotated.profileId, created.profileId);

  const second = await t.context.runtime.createByokProfile({
    workspaceId: workspace.id,
    provider: 'openai',
    name: 'Fallback',
    credential: 'fallback-secret',
    definition,
    enabled: true,
    actorUserId: user.id,
  });
  const reordered = await t.context.runtime.reorderByokProfiles({
    workspaceId: workspace.id,
    profiles: [
      { profileId: second.profileId, expectedRevision: second.revision },
      { profileId: created.profileId, expectedRevision: rotated.revision },
    ],
    actorUserId: user.id,
  });
  t.deepEqual(
    reordered.map(profile => profile.profileId),
    [second.profileId, created.profileId]
  );
  const reorderConflict = await t.throwsAsync(
    t.context.runtime.reorderByokProfiles({
      workspaceId: workspace.id,
      profiles: [
        { profileId: created.profileId, expectedRevision: rotated.revision },
        { profileId: second.profileId, expectedRevision: second.revision },
      ],
      actorUserId: user.id,
    })
  );
  t.regex(reorderConflict.message, /byok_revision_conflict/);
  t.deepEqual(
    (await t.context.runtime.listByokProfiles(workspace.id)).map(
      profile => profile.sortOrder
    ),
    [0, 1]
  );
  t.true(
    await t.context.runtime.deleteByokProfile(workspace.id, created.profileId)
  );
});

test('native local lease requires explicit model declarations', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(user.id);
  const lease = await t.context.runtime.createByokLocalLease({
    workspaceId: workspace.id,
    userId: user.id,
    providers: [
      {
        provider: 'openai',
        name: 'Local OpenAI',
        credential: 'local-secret',
        definition,
        enabled: true,
      },
    ],
  });
  t.truthy(lease.leaseId);
  t.true(lease.expiresAtMs > Date.now());
});
