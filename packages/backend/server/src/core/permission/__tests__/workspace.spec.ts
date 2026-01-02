import test from 'ava';

import { createTestingModule, TestingModule } from '../../../__tests__/utils';
import {
  Models,
  User,
  Workspace,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '../../../models';
import { PermissionModule } from '..';
import { mapWorkspaceRoleToPermissions } from '../types';
import { WorkspaceAccessController } from '../workspace';

let module: TestingModule;
let models: Models;
let ac: WorkspaceAccessController;
let user: User;
let ws: Workspace;

test.before(async () => {
  module = await createTestingModule({ imports: [PermissionModule] });
  models = module.get<Models>(Models);
  ac = new WorkspaceAccessController(models);
});

test.beforeEach(async () => {
  await module.initTestingDB();
  user = await models.user.create({ email: 'u1@affine.pro' });
  ws = await models.workspace.create(user.id);
});

test.after.always(async () => {
  await module.close();
});

test('should get null role', async t => {
  const role = await ac.getRole({
    workspaceId: 'ws1',
    userId: 'u1',
  });

  t.is(role, null);
});

test('should return null if role is not accepted', async t => {
  const u2 = await models.user.create({ email: 'u2@affine.pro' });
  await models.workspaceUser.set(ws.id, u2.id, WorkspaceRole.Collaborator, {
    status: WorkspaceMemberStatus.UnderReview,
  });

  const role = await ac.getRole({
    workspaceId: ws.id,
    userId: u2.id,
  });

  t.is(role, null);
});

test('should return [Owner] role if workspace is not found but local is allowed', async t => {
  const role = await ac.getRole({
    workspaceId: 'ws1',
    userId: 'u1',
    allowLocal: true,
  });

  t.is(role, WorkspaceRole.Owner);
});

test('should fallback to [External] if workspace is public', async t => {
  await models.workspace.update(ws.id, {
    public: true,
  });

  const role = await ac.getRole({
    workspaceId: ws.id,
    userId: 'random-user-id',
  });

  t.is(role, WorkspaceRole.External);
});

test('should return null if workspace is public but sharing disabled', async t => {
  await models.workspace.update(ws.id, {
    public: true,
    enableSharing: false,
  });

  const role = await ac.getRole({
    workspaceId: ws.id,
    userId: 'random-user-id',
  });

  t.is(role, null);
});

test('should return null even workspace has public doc', async t => {
  await models.doc.publish(ws.id, 'doc1');

  const role = await ac.getRole({
    workspaceId: ws.id,
    userId: 'random-user-id',
  });

  t.is(role, null);
});

test('should return null even workspace has public doc when sharing disabled', async t => {
  await models.doc.publish(ws.id, 'doc1');
  await models.workspace.update(ws.id, { enableSharing: false });

  const role = await ac.getRole({
    workspaceId: ws.id,
    userId: 'random-user-id',
  });

  t.is(role, null);
});

test('should return mapped external permission for workspace has public docs', async t => {
  await models.doc.publish(ws.id, 'doc1');

  const { permissions } = await ac.role({
    workspaceId: ws.id,
    userId: 'random-user-id',
  });

  t.deepEqual(
    permissions,
    mapWorkspaceRoleToPermissions(WorkspaceRole.External)
  );
});

test('should reject external doc roles when sharing disabled', async t => {
  await models.workspace.update(ws.id, {
    public: true,
    enableSharing: false,
  });

  const [docRole] = await ac.docRoles(
    {
      workspaceId: ws.id,
      userId: 'random-user-id',
    },
    ['doc1']
  );

  t.is(docRole.role, null);
  t.false(docRole.permissions['Doc.Read']);
});

test('should return mapped permissions', async t => {
  const { permissions } = await ac.role({
    workspaceId: ws.id,
    userId: user.id,
  });

  t.deepEqual(permissions, mapWorkspaceRoleToPermissions(WorkspaceRole.Owner));
});

test('should assert action', async t => {
  await t.notThrowsAsync(
    ac.assert(
      { workspaceId: ws.id, userId: user.id },
      'Workspace.TransferOwner'
    )
  );

  const u2 = await models.user.create({ email: 'u2@affine.pro' });

  await t.throwsAsync(
    ac.assert({ workspaceId: ws.id, userId: u2.id }, 'Workspace.Sync')
  );

  await models.workspaceUser.set(ws.id, u2.id, WorkspaceRole.Admin, {
    status: WorkspaceMemberStatus.Accepted,
  });

  await t.notThrowsAsync(
    ac.assert(
      { workspaceId: ws.id, userId: u2.id },
      'Workspace.Settings.Update'
    )
  );
});
