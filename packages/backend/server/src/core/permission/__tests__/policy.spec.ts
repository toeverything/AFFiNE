import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import {
  Models,
  User,
  Workspace,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../../models';
import { QuotaServiceModule } from '../../quota/service.module';
import { QuotaStateService } from '../../quota/state';
import { PermissionModule } from '../index';
import { WorkspacePolicyService } from '../policy';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
  policy: WorkspacePolicyService;
}

const test = ava as TestFn<Context>;

type WorkspaceQuotaSnapshot = Awaited<
  ReturnType<QuotaStateService['reconcileWorkspaceQuotaState']>
> & {
  readonlyReasons: string[];
};

const readonlyWorkspaceState = (
  workspaceId: string,
  readonlyReasons: string[],
  overrides: Partial<WorkspaceQuotaSnapshot> = {}
) =>
  ({
    workspaceId,
    plan: 'free',
    sourceEntitlementId: null,
    ownerUserId: owner.id,
    usesOwnerQuota: true,
    seatLimit: 3,
    memberCount: 1,
    overcapacityMemberCount: readonlyReasons.includes('member_overflow')
      ? 1
      : 0,
    blobLimit: BigInt(1),
    storageQuota: BigInt(1),
    usedStorageQuota: readonlyReasons.includes('storage_overflow')
      ? BigInt(2)
      : BigInt(0),
    historyPeriodSeconds: 1,
    readonly: readonlyReasons.length > 0,
    readonlyReasons,
    flags: {},
    known: true,
    stale: false,
    lastReconciledAt: new Date(),
    staleAfter: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) satisfies WorkspaceQuotaSnapshot;
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
  t.context.db = module.get(PrismaClient);
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

test('should reuse quota state service exported by quota service module', async t => {
  const module = await createTestingModule(
    { imports: [PermissionModule, QuotaServiceModule] },
    false
  );

  try {
    const quotaState = module
      .select(QuotaServiceModule)
      .get(QuotaStateService, {
        strict: true,
      });
    const policy = module.select(PermissionModule).get(WorkspacePolicyService, {
      strict: true,
    });

    t.is(Reflect.get(policy, 'quotaState'), quotaState);
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
});

test('should report readonly state when fallback owner member quota overflows', async t => {
  await addAcceptedMembers(t.context.models, workspace.id, 10);

  const state = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.true(state.isReadonly);
  t.true(state.canRecoverByRemovingMembers);
  t.false(state.canRecoverByDeletingBlobs);
  t.deepEqual(state.readonlyReasons, ['member_overflow']);
});

test('should enter readonly mode when fallback owner storage quota overflows', async t => {
  const quotaState = Sinon.stub(
    Reflect.get(t.context.policy, 'quotaState') as QuotaStateService,
    'reconcileWorkspaceQuotaState'
  );
  quotaState.callsFake(async workspaceId =>
    readonlyWorkspaceState(workspaceId, ['storage_overflow'])
  );

  const state = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.true(state.isReadonly);
  t.false(state.canRecoverByRemovingMembers);
  t.true(state.canRecoverByDeletingBlobs);
  t.deepEqual(state.readonlyReasons, ['storage_overflow']);
});

test('should report recovered state after workspace usage recovers', async t => {
  const quotaState = Sinon.stub(
    Reflect.get(t.context.policy, 'quotaState') as QuotaStateService,
    'reconcileWorkspaceQuotaState'
  );
  quotaState
    .onFirstCall()
    .callsFake(async workspaceId =>
      readonlyWorkspaceState(workspaceId, ['storage_overflow'])
    );
  quotaState
    .onSecondCall()
    .callsFake(async workspaceId => readonlyWorkspaceState(workspaceId, []));
  quotaState
    .onThirdCall()
    .callsFake(async workspaceId => readonlyWorkspaceState(workspaceId, []));

  await t.context.policy.reconcileWorkspaceQuotaState(workspace.id);

  const recovered = await t.context.policy.reconcileWorkspaceQuotaState(
    workspace.id
  );

  t.false(recovered.isReadonly);
  t.deepEqual(recovered.readonlyReasons, []);
});

test('should roll back team cancellation cleanup when cleanup fails', async t => {
  const pending = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const admin = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  await t.context.db.$transaction(async db => {
    await db.$executeRaw`
      SELECT set_config('affine.permission_projection.enabled', 'off', true)
    `;
    const pendingPermission = await db.workspaceUserRole.create({
      data: {
        workspaceId: workspace.id,
        userId: pending.id,
        type: WorkspaceRole.Collaborator,
        status: WorkspaceMemberStatus.Pending,
      },
    });
    const [invitationShape] = await db.$queryRaw<Array<{ current: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'workspace_invitations'
          AND column_name = 'requested_role'
      ) AS "current"
    `;
    if (invitationShape?.current) {
      await db.workspaceInvitation.create({
        data: {
          workspaceId: workspace.id,
          inviteeUserId: pending.id,
          requestedRole: 'member',
          status: 'pending',
          kind: 'email',
          legacyPermissionId: pendingPermission.id,
        },
      });
    } else {
      await db.$executeRaw`
        INSERT INTO workspace_invitations (
          workspace_id,
          invitee_user_id,
          role,
          state,
          source,
          updated_at
        )
        VALUES (
          ${workspace.id},
          ${pending.id},
          ${'member'},
          ${'pending'},
          ${'email'},
          now()
        )
      `;
    }
  });
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
