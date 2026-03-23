import { randomUUID } from 'node:crypto';

import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { SpaceAccessDenied } from '../../../base';
import {
  Models,
  User,
  Workspace,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../../models';
import { QuotaService } from '../../quota/service';
import { QuotaServiceModule } from '../../quota/service.module';
import { PermissionModule } from '../index';
import { WorkspacePolicyService } from '../policy';

interface Context {
  module: TestingModule;
  models: Models;
  policy: WorkspacePolicyService;
}

const test = ava as TestFn<Context>;

const READONLY_FEATURE = 'quota_exceeded_readonly_workspace_v1' as const;
type WorkspaceQuotaSnapshot = Awaited<
  ReturnType<QuotaService['getWorkspaceQuotaWithUsage']>
> & {
  ownerQuota?: string;
};
async function addAcceptedMembers(
  models: Models,
  workspaceId: string,
  count: number
) {
  for (let index = 0; index < count; index++) {
    const member = await models.user.create({
      email: `${randomUUID()}@affine.pro`,
    });
    await models.workspaceUser.set(
      workspaceId,
      member.id,
      WorkspaceRole.Collaborator,
      {
        status: WorkspaceMemberStatus.Accepted,
      }
    );
  }
}

let owner: User;
let workspace: Workspace;

test.before(async t => {
  const module = await createTestingModule({ imports: [PermissionModule] });
  t.context.module = module;
  t.context.models = module.get(Models);
  t.context.policy = module.get(WorkspacePolicyService);
});

test.beforeEach(async t => {
  Sinon.restore();
  await t.context.module.initTestingDB();
  owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  workspace = await t.context.models.workspace.create(owner.id);
});

test.after.always(async t => {
  await t.context.module.close();
});

test('should reuse quota service exported by quota service module', async t => {
  const module = await createTestingModule(
    { imports: [PermissionModule, QuotaServiceModule] },
    false
  );

  try {
    const quota = module.select(QuotaServiceModule).get(QuotaService, {
      strict: true,
    });
    const policy = module.select(PermissionModule).get(WorkspacePolicyService, {
      strict: true,
    });

    t.is(Reflect.get(policy, 'quota'), quota);
  } finally {
    await module.close();
  }
});

test('should keep owned workspace writable when quota is within limit', async t => {
  const state = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.false(state.isReadonly);
  t.deepEqual(state.readonlyReasons, []);
  t.false(
    await t.context.models.workspaceFeature.has(workspace.id, READONLY_FEATURE)
  );
});

test('should enter readonly mode when fallback owner member quota overflows', async t => {
  await addAcceptedMembers(t.context.models, workspace.id, 10);

  const state = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.true(state.isReadonly);
  t.true(state.canRecoverByRemovingMembers);
  t.false(state.canRecoverByDeletingBlobs);
  t.deepEqual(state.readonlyReasons, ['member_overflow']);
  t.true(
    await t.context.models.workspaceFeature.has(workspace.id, READONLY_FEATURE)
  );
  await t.throwsAsync(t.context.policy.assertCanInviteMembers(workspace.id), {
    instanceOf: SpaceAccessDenied,
  });
});

test('should deny blob uploads when user no longer has write access', async t => {
  const external = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.models.workspaceUser.set(
    workspace.id,
    external.id,
    WorkspaceRole.External,
    { status: WorkspaceMemberStatus.Accepted }
  );

  await t.throwsAsync(
    t.context.policy.assertCanUploadBlob(external.id, workspace.id),
    { instanceOf: SpaceAccessDenied }
  );
});

test('should enter readonly mode when fallback owner storage quota overflows', async t => {
  const quota = Sinon.stub(
    Reflect.get(t.context.policy, 'quota') as QuotaService,
    'getWorkspaceQuotaWithUsage'
  );
  quota.resolves({
    name: 'Free',
    blobLimit: 1,
    storageQuota: 1,
    usedStorageQuota: 2,
    historyPeriod: 1,
    memberLimit: 3,
    memberCount: 1,
    overcapacityMemberCount: 0,
    usedSize: 2,
    ownerQuota: owner.id,
  } satisfies WorkspaceQuotaSnapshot);

  const state = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.true(state.isReadonly);
  t.false(state.canRecoverByRemovingMembers);
  t.true(state.canRecoverByDeletingBlobs);
  t.deepEqual(state.readonlyReasons, ['storage_overflow']);
  t.true(
    await t.context.models.workspaceFeature.has(workspace.id, READONLY_FEATURE)
  );
});

test('should leave readonly mode after workspace usage recovers', async t => {
  const quota = Sinon.stub(
    Reflect.get(t.context.policy, 'quota') as QuotaService,
    'getWorkspaceQuotaWithUsage'
  );
  quota.onFirstCall().resolves({
    name: 'Free',
    blobLimit: 1,
    storageQuota: 1,
    usedStorageQuota: 2,
    historyPeriod: 1,
    memberLimit: 3,
    memberCount: 1,
    overcapacityMemberCount: 0,
    usedSize: 2,
    ownerQuota: owner.id,
  } satisfies WorkspaceQuotaSnapshot);
  quota.onSecondCall().resolves({
    name: 'Free',
    blobLimit: 1,
    storageQuota: 1,
    usedStorageQuota: 0,
    historyPeriod: 1,
    memberLimit: 3,
    memberCount: 1,
    overcapacityMemberCount: 0,
    usedSize: 0,
    ownerQuota: owner.id,
  } satisfies WorkspaceQuotaSnapshot);
  quota.onThirdCall().resolves({
    name: 'Free',
    blobLimit: 1,
    storageQuota: 1,
    usedStorageQuota: 0,
    historyPeriod: 1,
    memberLimit: 3,
    memberCount: 1,
    overcapacityMemberCount: 0,
    usedSize: 0,
    ownerQuota: owner.id,
  } satisfies WorkspaceQuotaSnapshot);

  await t.context.policy.reconcileWorkspaceQuotaState(workspace.id);
  t.true(
    await t.context.models.workspaceFeature.has(workspace.id, READONLY_FEATURE)
  );

  const recovered = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.false(recovered.isReadonly);
  t.deepEqual(recovered.readonlyReasons, []);
  t.false(
    await t.context.models.workspaceFeature.has(workspace.id, READONLY_FEATURE)
  );
  await t.notThrowsAsync(t.context.policy.assertCanInviteMembers(workspace.id));
});

test('should roll back team cancellation cleanup when cleanup fails', async t => {
  const pending = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const admin = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.models.workspaceUser.set(
    workspace.id,
    pending.id,
    WorkspaceRole.Collaborator
  );
  await t.context.models.workspaceUser.set(
    workspace.id,
    admin.id,
    WorkspaceRole.Admin,
    {
      status: WorkspaceMemberStatus.Accepted,
    }
  );
  await t.context.models.workspaceFeature.add(
    workspace.id,
    'team_plan_v1',
    'test team workspace',
    {
      memberLimit: 20,
    }
  );

  const failure = new Error('cleanup failed');
  Sinon.stub(t.context.models.workspaceFeature, 'remove').rejects(failure);

  const error = await t.throwsAsync(
    t.context.policy.handleTeamPlanCanceled(workspace.id),
    {
      is: failure,
    }
  );

  t.is(error, failure);
  t.truthy(await t.context.models.workspaceUser.get(workspace.id, pending.id));
  t.is(
    (await t.context.models.workspaceUser.get(workspace.id, admin.id))?.type,
    WorkspaceRole.Admin
  );
  t.true(
    await t.context.models.workspaceFeature.has(workspace.id, 'team_plan_v1')
  );
});
