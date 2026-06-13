import { randomUUID } from 'node:crypto';

import test from 'ava';

import { createTestingModule, TestingModule } from '../../../__tests__/utils';
import {
  Models,
  User,
  Workspace,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../../models';
import { PermissionAccess, PermissionModule } from '../index';
import { WorkspacePolicyService } from '../policy';
import { mapWorkspaceRoleToPermissions } from '../types';

let module: TestingModule;
let models: Models;
let ac: PermissionAccess;
let policy: WorkspacePolicyService;
let user: User;
let ws: Workspace;
let underReviewUserId: string;

test.before(async () => {
  module = await createTestingModule({ imports: [PermissionModule] });
  models = module.get<Models>(Models);
  ac = module.get(PermissionAccess);
  policy = module.get(WorkspacePolicyService);
});

test.beforeEach(async () => {
  await module.initTestingDB();
  user = await models.user.create({ email: `${randomUUID()}@affine.pro` });
  ws = await models.workspace.create(user.id);
});

test.after.always(async () => {
  await module.close();
});

const roleCases: Array<{
  title: string;
  setup?: () => Promise<void>;
  resource: () => {
    workspaceId: string;
    userId: string;
    allowLocal?: boolean;
  };
  expectedRole: WorkspaceRole | null;
}> = [
  {
    title: 'should get null role',
    resource: () => ({
      workspaceId: 'ws1',
      userId: 'u1',
    }),
    expectedRole: null,
  },
  {
    title: 'should return null if role is not accepted',
    setup: async () => {
      const u2 = await models.user.create({
        email: `${randomUUID()}@affine.pro`,
      });
      underReviewUserId = u2.id;
      await models.workspaceUser.set(ws.id, u2.id, WorkspaceRole.Collaborator, {
        status: WorkspaceMemberStatus.UnderReview,
      });
    },
    resource: () => ({
      workspaceId: ws.id,
      userId: underReviewUserId,
    }),
    expectedRole: null,
  },
  {
    title:
      'should return [Owner] role if workspace is not found but local is allowed',
    resource: () => ({
      workspaceId: 'ws1',
      userId: 'u1',
      allowLocal: true,
    }),
    expectedRole: WorkspaceRole.Owner,
  },
  {
    title: 'should fallback to [External] if workspace is public',
    setup: async () => {
      await models.workspace.update(ws.id, {
        public: true,
      });
    },
    resource: () => ({
      workspaceId: ws.id,
      userId: 'random-user-id',
    }),
    expectedRole: WorkspaceRole.External,
  },
  {
    title: 'should return null if workspace is public but sharing disabled',
    setup: async () => {
      await models.workspace.update(ws.id, {
        public: true,
        enableSharing: false,
      });
    },
    resource: () => ({
      workspaceId: ws.id,
      userId: 'random-user-id',
    }),
    expectedRole: null,
  },
  {
    title: 'should return null even workspace has public doc',
    setup: async () => {
      await models.doc.publish(ws.id, 'doc1');
    },
    resource: () => ({
      workspaceId: ws.id,
      userId: 'random-user-id',
    }),
    expectedRole: null,
  },
  {
    title:
      'should return null even workspace has public doc when sharing disabled',
    setup: async () => {
      await models.doc.publish(ws.id, 'doc1');
      await models.workspace.update(ws.id, { enableSharing: false });
    },
    resource: () => ({
      workspaceId: ws.id,
      userId: 'random-user-id',
    }),
    expectedRole: null,
  },
];

async function getRole(resource: {
  workspaceId: string;
  userId: string;
  allowLocal?: boolean;
}) {
  const checker = ac.user(resource.userId).workspace(resource.workspaceId);
  if (resource.allowLocal) {
    checker.allowLocal();
  }
  return (await checker.permissions()).role;
}

function workspace(resource: {
  workspaceId: string;
  userId: string;
  allowLocal?: boolean;
}) {
  const checker = ac.user(resource.userId).workspace(resource.workspaceId);
  if (resource.allowLocal) {
    checker.allowLocal();
  }
  return checker;
}

for (const roleCase of roleCases) {
  test(roleCase.title, async t => {
    await roleCase.setup?.();
    const role = await getRole(roleCase.resource());

    t.is(role, roleCase.expectedRole);
  });
}

test('should return mapped null permission even workspace has public docs', async t => {
  await models.doc.publish(ws.id, 'doc1');

  const { permissions } = await workspace({
    workspaceId: ws.id,
    userId: 'random-user-id',
  }).permissions();

  t.deepEqual(permissions, mapWorkspaceRoleToPermissions(null));
});

test('should deny external read assert even workspace has public docs', async t => {
  await models.doc.publish(ws.id, 'doc1');

  await t.throwsAsync(
    workspace({
      workspaceId: ws.id,
      userId: 'random-user-id',
    }).assert('Workspace.Read')
  );
});

test('should deny external read assert when sharing disabled even if workspace has public docs', async t => {
  await models.doc.publish(ws.id, 'doc1');
  await models.workspace.update(ws.id, { enableSharing: false });

  await t.throwsAsync(
    workspace({
      workspaceId: ws.id,
      userId: 'random-user-id',
    }).assert('Workspace.Read')
  );
});

test('should reject external doc roles when sharing disabled', async t => {
  await models.workspace.update(ws.id, {
    public: true,
    enableSharing: false,
  });

  const docRole = await ac
    .user('random-user-id')
    .doc(ws.id, 'doc1')
    .permissions();

  t.is(docRole.role, null);
  t.false(docRole.permissions['Doc.Read']);
});

test('should return mapped permissions', async t => {
  const { permissions } = await workspace({
    workspaceId: ws.id,
    userId: user.id,
  }).permissions();

  t.deepEqual(permissions, mapWorkspaceRoleToPermissions(WorkspaceRole.Owner));
});

test('should assert action', async t => {
  await t.notThrowsAsync(
    workspace({ workspaceId: ws.id, userId: user.id }).assert(
      'Workspace.TransferOwner'
    )
  );

  const u2 = await models.user.create({ email: 'u2@affine.pro' });

  await t.throwsAsync(
    workspace({ workspaceId: ws.id, userId: u2.id }).assert('Workspace.Sync')
  );

  await models.workspaceUser.set(ws.id, u2.id, WorkspaceRole.Admin, {
    status: WorkspaceMemberStatus.Accepted,
  });

  await t.notThrowsAsync(
    workspace({ workspaceId: ws.id, userId: u2.id }).assert(
      'Workspace.Settings.Update'
    )
  );
});

test('should apply readonly workspace restrictions while keeping cleanup actions', async t => {
  for (let index = 0; index < 10; index++) {
    const member = await models.user.create({
      email: `${randomUUID()}@affine.pro`,
    });
    await models.workspaceUser.set(
      ws.id,
      member.id,
      WorkspaceRole.Collaborator,
      {
        status: WorkspaceMemberStatus.Accepted,
      }
    );
  }
  await policy.reconcileWorkspaceQuotaState(ws.id);

  const { permissions } = await workspace({
    workspaceId: ws.id,
    userId: user.id,
  }).permissions();

  t.false(permissions['Workspace.CreateDoc']);
  t.false(permissions['Workspace.Settings.Update']);
  t.false(permissions['Workspace.Properties.Create']);
  t.false(permissions['Workspace.Properties.Update']);
  t.false(permissions['Workspace.Properties.Delete']);
  t.false(permissions['Workspace.Blobs.Write']);
  t.true(permissions['Workspace.Read']);
  t.true(permissions['Workspace.Sync']);
  t.true(permissions['Workspace.Users.Manage']);
  t.true(permissions['Workspace.Blobs.List']);
  t.true(permissions['Workspace.TransferOwner']);
  t.true(permissions['Workspace.Payment.Manage']);
});
