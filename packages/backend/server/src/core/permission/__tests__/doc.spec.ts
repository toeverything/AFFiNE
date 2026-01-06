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
import { DocAccessController } from '../doc';
import { DocRole, mapDocRoleToPermissions } from '../types';

let module: TestingModule;
let models: Models;
let ac: DocAccessController;
let user: User;
let ws: Workspace;

test.before(async () => {
  module = await createTestingModule({ imports: [PermissionModule] });
  models = module.get<Models>(Models);
  ac = module.get(DocAccessController);
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
    docId: 'doc1',
    userId: 'u1',
  });

  t.is(role, null);
});

test('should return null if workspace role is not accepted', async t => {
  const u2 = await models.user.create({ email: 'u2@affine.pro' });
  await models.workspaceUser.set(ws.id, u2.id, WorkspaceRole.Collaborator, {
    status: WorkspaceMemberStatus.UnderReview,
  });

  const role = await ac.getRole({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: u2.id,
  });

  t.is(role, null);
});

test('should return [Owner] role if workspace is not found but local is allowed', async t => {
  const role = await ac.getRole({
    workspaceId: 'ws1',
    docId: 'doc1',
    userId: 'u1',
    allowLocal: true,
  });

  t.is(role, DocRole.Owner);
});

test('should fallback to [External] if workspace is public', async t => {
  await models.workspace.update(ws.id, {
    public: true,
  });

  const role = await ac.getRole({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: 'random-user-id',
  });

  t.is(role, DocRole.External);
});

test('should return null even if workspace has other public doc', async t => {
  await models.doc.publish(ws.id, 'doc1');

  const role = await ac.getRole({
    workspaceId: ws.id,
    docId: 'doc2',
    userId: 'random-user-id',
  });

  t.is(role, null);
});

test('should return [External] if doc is public', async t => {
  await models.doc.publish(ws.id, 'doc1');

  const role = await ac.getRole({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: 'random-user-id',
  });

  t.is(role, DocRole.External);
});

test('should return null if doc role is [None]', async t => {
  await models.doc.setDefaultRole(ws.id, 'doc1', DocRole.None);

  await models.workspaceUser.set(ws.id, user.id, WorkspaceRole.Collaborator, {
    status: WorkspaceMemberStatus.Accepted,
  });

  const role = await ac.getRole({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: user.id,
  });

  t.is(role, null);
});

test('should return [External] if doc role is [None] but doc is public', async t => {
  await models.doc.setDefaultRole(ws.id, 'doc1', DocRole.None);
  await models.workspaceUser.set(ws.id, user.id, WorkspaceRole.Collaborator, {
    status: WorkspaceMemberStatus.Accepted,
  });
  await models.doc.publish(ws.id, 'doc1');

  const role = await ac.getRole({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: 'random-user-id',
  });

  t.is(role, DocRole.External);
});

test('should return mapped permissions', async t => {
  const { permissions } = await ac.role({
    workspaceId: ws.id,
    docId: 'doc1',
    userId: user.id,
  });

  t.deepEqual(permissions, mapDocRoleToPermissions(DocRole.Owner));
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

  const u2 = await models.user.create({ email: 'u2@affine.pro' });

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
