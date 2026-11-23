import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';

import { SpaceOwnerNotFound } from '../../base';
import type { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import type { WorkspaceType } from '../../core/workspaces';
import { Models, WorkspaceMemberStatus, WorkspaceRole } from '../../models';
import { ByokEntitlementPolicy } from '../../plugins/copilot/byok/policy';
import { WorkspaceByokResolver } from '../../plugins/copilot/byok/resolver';
import {
  ByokEndpointKind,
  ByokModelInput,
  ByokModelOutput,
  ByokProvider,
} from '../../plugins/copilot/byok/types';
import { createTestingModule, type TestingModule } from '../utils';

type Context = {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  runtime: BackendRuntimeProvider;
  resolver: WorkspaceByokResolver;
  policy: ByokEntitlementPolicy;
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

test.before(async t => {
  process.env.AFFINE_PRIVATE_KEY = testPrivateKey;
  t.context.module = await createTestingModule();
  t.context.db = t.context.module.get(PrismaClient);
  t.context.models = t.context.module.get(Models);
  t.context.runtime = t.context.module.get(BackendRuntimeProvider);
  t.context.resolver = t.context.module.get(WorkspaceByokResolver);
  t.context.policy = t.context.module.get(ByokEntitlementPolicy);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.afterEach.always(() => {
  Sinon.restore();
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
  const policy = {
    enabled: true,
    allowedProviders: ['openai'],
    customEndpointMode: 'disabled',
    privateEndpointSupported: false,
  };
  Sinon.stub(t.context.runtime, 'getByokPolicy').resolves(policy);
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
  t.deepEqual(settings.policy, policy);
});

test('BYOK local lease maps workspace permission and entitlement results', async t => {
  const user = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const currentUser = {
    id: user.id,
    email: user.email,
    avatarUrl: user.avatarUrl,
    name: user.name,
    disabled: user.disabled,
    hasPassword: null,
    emailVerified: true,
  } satisfies CurrentUser;

  await t.throwsAsync(
    t.context.resolver.createWorkspaceByokLocalLease(currentUser, {
      workspaceId: randomUUID(),
      providers: [],
    }),
    { message: /permission to access Space/ }
  );

  const workspace = await t.context.models.workspace.create(user.id);
  const leaseInput = {
    workspaceId: workspace.id,
    providers: [
      {
        provider: ByokProvider.openai,
        name: 'Local OpenAI',
        description: null,
        credential: 'local-secret',
        definition: {
          endpoint: {
            kind: ByokEndpointKind.provider_default,
            url: null,
            dialect: null,
          },
          models: [
            {
              modelId: 'gpt-4o-mini',
              enabled: true,
              capabilities: [
                {
                  input: [ByokModelInput.text],
                  output: [ByokModelOutput.text],
                  features: [],
                  attachmentKinds: [],
                  attachmentSources: [],
                },
              ],
            },
          ],
        },
        enabled: true,
      },
    ],
  };
  await t.throwsAsync(
    t.context.resolver.createWorkspaceByokLocalLease(currentUser, leaseInput),
    { message: /BYOK requires/ }
  );

  await t.context.db.entitlement.create({
    data: {
      targetType: 'user',
      targetId: user.id,
      source: 'cloud_subscription',
      subjectId: `active:${user.id}`,
      plan: 'pro',
      status: 'active',
    },
  });
  t.truthy(
    await t.context.resolver.createWorkspaceByokLocalLease(
      currentUser,
      leaseInput
    )
  );

  const member = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.models.workspaceUser.set(
    workspace.id,
    member.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );
  await t.context.db.entitlement.create({
    data: {
      targetType: 'user',
      targetId: member.id,
      source: 'cloud_subscription',
      subjectId: `active:${member.id}`,
      plan: 'pro',
      status: 'active',
    },
  });
  await t.throwsAsync(
    t.context.resolver.createWorkspaceByokLocalLease(
      { ...currentUser, id: member.id, email: member.email },
      leaseInput
    ),
    { message: /permission to access Space/ }
  );

  await t.context.db.workspaceMember.deleteMany({
    where: { workspaceId: workspace.id, role: 'owner' },
  });
  await t.throwsAsync(t.context.policy.hasServerEntitlement(workspace.id), {
    instanceOf: SpaceOwnerNotFound,
  });
});

test('BYOK owner lookup preserves infrastructure errors', async t => {
  Sinon.stub(t.context.runtime, 'getByokEntitlementV1').rejects(
    new Error('database unavailable')
  );
  await t.throwsAsync(t.context.policy.hasServerEntitlement('workspace'), {
    message: 'database unavailable',
  });
});
