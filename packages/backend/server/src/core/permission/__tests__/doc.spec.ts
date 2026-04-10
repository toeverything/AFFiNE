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
import { DocAccessController } from '../doc';
import { PermissionModule } from '../index';
import { WorkspacePolicyService } from '../policy';
import { DocRole, mapDocRoleToPermissions } from '../types';

let module: TestingModule;
let models: Models;
let ac: DocAccessController;
let policy: WorkspacePolicyService;
let user: User;
let ws: Workspace;
let underReviewUserId: string;

test.before(async () => {
  module = await createTestingModule({ imports: [PermissionModule] });
  models = module.get<Models>(Models);
  ac = module.get(DocAccessController);
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
    docId: string;
    userId: string;
    allowLocal?: boolean;
  };
  expectedRole: DocRole | null;
}> = [
  {
    title: 'should get null role',
    resource: () => ({
      workspaceId: 'ws1',
      docId: 'doc1',
      userId: 'u1',
    }),
    expectedRole: null,
  },
  {
    title: 'should return null if workspace role is not accepted',
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
      docId: 'doc1',
      userId: underReviewUserId,
    }),
    expectedRole: null,
  },
  {
    title:
      'should return [Owner] role if workspace is not found but local is allowed',
    resource: () => ({
      workspaceId: 'ws1',
      docId: 'doc1',
      userId: 'u1',
      allowLocal: true,
    }),
    expectedRole: DocRole.Owner,
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
      docId: 'doc1',
      userId: 'random-user-id',
    }),
    expectedRole: DocRole.External,
  },
  {
    title: 'should return null even if workspace has other public doc',
    setup: async () => {
      await models.doc.publish(ws.id, 'doc1');
    },
    resource: () => ({
      workspaceId: ws.id,
      docId: 'doc2',
      userId: 'random-user-id',
    }),
    expectedRole: null,
  },
  {
    title: 'should return [External] if doc is public',
    setup: async () => {
      await models.doc.publish(ws.id, 'doc1');
    },
    resource: () => ({
      workspaceId: ws.id,
      docId: 'doc1',
      userId: 'random-user-id',
    }),
    expectedRole: DocRole.External,
  },
  {
    title: 'should return null if doc role is [None]',
    setup: async () => {
      await models.doc.setDefaultRole(ws.id, 'doc1', DocRole.None);
      await models.workspaceUser.set(
        ws.id,
        user.id,
        WorkspaceRole.Collaborator,
        {
          status: WorkspaceMemberStatus.Accepted,
        }
      );
    },
    resource: () => ({
      workspaceId: ws.id,
      docId: 'doc1',
      userId: user.id,
    }),
    expectedRole: null,
  },
  {
    title: 'should return [External] if doc role is [None] but doc is public',
    setup: async () => {
      await models.doc.setDefaultRole(ws.id, 'doc1', DocRole.None);
      await models.workspaceUser.set(
        ws.id,
        user.id,
        WorkspaceRole.Collaborator,
        {
          status: WorkspaceMemberStatus.Accepted,
        }
      );
      await models.doc.publish(ws.id, 'doc1');
    },
    resource: () => ({
      workspaceId: ws.id,
      docId: 'doc1',
      userId: 'random-user-id',
    }),
    expectedRole: DocRole.External,
  },
];

for (const roleCase of roleCases) {
  test(roleCase.title, async t => {
    await roleCase.setup?.();
    const resource = roleCase.resource();
    const role = await ac.getRole(resource);

    t.is(role, roleCase.expectedRole);
  });
}

test('should return mapped permissions', async t => {
  const { permissions } = await ac.role({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: user.id,
  });

  t.deepEqual(permissions, mapDocRoleToPermissions(DocRole.Owner));
});

test('should deny publish permission when workspace sharing is disabled', async t => {
  await models.workspace.update(ws.id, {
    enableSharing: false,
  });

  const { permissions } = await ac.role({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: user.id,
  });

  t.false(permissions['Doc.Publish']);
  t.true(permissions['Doc.Read']);
});

test('should deny publish assert when workspace sharing is disabled', async t => {
  await models.workspace.update(ws.id, {
    enableSharing: false,
  });

  await t.throwsAsync(
    ac.assert(
      {
        workspaceId: ws.id,
        docId: 'doc1',
        userId: user.id,
      },
      'Doc.Publish'
    )
  );
  await t.notThrowsAsync(
    ac.assert(
      {
        workspaceId: ws.id,
        docId: 'doc1',
        userId: user.id,
      },
      'Doc.Read'
    )
  );
});

test('should deny external read assert when sharing is disabled even if doc is public', async t => {
  await models.doc.publish(ws.id, 'doc1');
  await models.workspace.update(ws.id, {
    enableSharing: false,
  });

  await t.throwsAsync(
    ac.assert(
      {
        workspaceId: ws.id,
        docId: 'doc1',
        userId: 'random-user-id',
      },
      'Doc.Read'
    )
  );
});

test('should assert action', async t => {
  await t.notThrowsAsync(
    ac.assert(
      {
        workspaceId: ws.id,
        docId: 'doc1',
        userId: user.id,
      },
      'Doc.Update'
    )
  );

  const u2 = await models.user.create({ email: `${randomUUID()}@affine.pro` });

  await t.throwsAsync(
    ac.assert(
      { workspaceId: ws.id, docId: 'doc1', userId: u2.id },
      'Doc.Update'
    )
  );

  await models.workspaceUser.set(ws.id, u2.id, WorkspaceRole.Collaborator, {
    status: WorkspaceMemberStatus.Accepted,
  });

  await models.docUser.set(ws.id, 'doc1', u2.id, DocRole.Manager);

  await t.notThrowsAsync(
    ac.assert(
      { workspaceId: ws.id, docId: 'doc1', userId: u2.id },
      'Doc.Delete'
    )
  );
});

test('should apply readonly doc restrictions while keeping cleanup actions', async t => {
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

  const { permissions } = await ac.role({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: user.id,
  });

  t.false(permissions['Doc.Update']);
  t.false(permissions['Doc.Publish']);
  t.false(permissions['Doc.Duplicate']);
  t.false(permissions['Doc.Comments.Create']);
  t.false(permissions['Doc.Comments.Update']);
  t.false(permissions['Doc.Comments.Resolve']);
  t.true(permissions['Doc.Read']);
  t.true(permissions['Doc.Delete']);
  t.true(permissions['Doc.Trash']);
  t.true(permissions['Doc.TransferOwner']);
});
