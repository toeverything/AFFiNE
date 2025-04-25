import { randomBytes } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { EventBus, NewOwnerIsNotActiveMember } from '../../base';
import { Models, WorkspaceMemberStatus, WorkspaceRole } from '../../models';
import { createModule, TestingModule } from '../create-module';
import { Mockers } from '../mocks';

let db: PrismaClient;
let models: Models;
let module: TestingModule;
let event: Sinon.SinonStubbedInstance<EventBus>;

test.before(async () => {
  module = await createModule({
    tapModule: m => {
      m.overrideProvider(EventBus).useValue(Sinon.createStubInstance(EventBus));
    },
  });
  models = module.get(Models);
  event = module.get(EventBus);
  db = module.get(PrismaClient);
});

test.beforeEach(async () => {
  Sinon.reset();
});

test.after(async () => {
  await module.close();
});

test('should set workspace owner', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  await models.workspaceUser.setOwner(workspace.id, user.id);
  const owner = await models.workspaceUser.getOwner(workspace.id);

  t.is(owner.id, user.id);
});

test('should transfer workespace owner', async t => {
  const [user, user2] = await module.create(Mockers.User, 2);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: user2.id,
  });

  await models.workspaceUser.setOwner(workspace.id, user2.id);

  t.true(
    event.emit.lastCall.calledWith('workspace.owner.changed', {
      workspaceId: workspace.id,
      from: user.id,
      to: user2.id,
    })
  );

  const owner2 = await models.workspaceUser.getOwner(workspace.id);
  t.is(owner2.id, user2.id);
});

test('should throw if transfer owner to non-active member', async t => {
  const [user, user2] = await module.create(Mockers.User, 2);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  await t.throwsAsync(models.workspaceUser.setOwner(workspace.id, user2.id), {
    instanceOf: NewOwnerIsNotActiveMember,
  });

  await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: user2.id,
    status: WorkspaceMemberStatus.AllocatingSeat,
  });

  await t.throwsAsync(models.workspaceUser.setOwner(workspace.id, user2.id), {
    instanceOf: NewOwnerIsNotActiveMember,
  });
});

test('should get user role', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  await models.workspaceUser.set(workspace.id, user.id, WorkspaceRole.Admin);

  const role = await models.workspaceUser.get(workspace.id, user.id);

  t.is(role!.type, WorkspaceRole.Admin);
});

test('should get active workspace role', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  await models.workspaceUser.set(workspace.id, user.id, WorkspaceRole.Admin, {
    status: WorkspaceMemberStatus.Accepted,
  });

  const role = await models.workspaceUser.getActive(workspace.id, user.id);

  t.is(role!.type, WorkspaceRole.Admin);
});

test('should not get inactive workspace role', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const u1 = await module.create(Mockers.User);

  await models.workspaceUser.set(workspace.id, u1.id, WorkspaceRole.Admin);

  let role = await models.workspaceUser.getActive(workspace.id, u1.id);
  t.is(role, null);

  await models.workspaceUser.setStatus(
    workspace.id,
    u1.id,
    WorkspaceMemberStatus.UnderReview
  );

  role = await models.workspaceUser.getActive(workspace.id, u1.id);
  t.is(role, null);
});

test('should update user role', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);
  await models.workspaceUser.set(workspace.id, user.id, WorkspaceRole.Admin, {
    status: WorkspaceMemberStatus.Accepted,
  });
  const role = await models.workspaceUser.get(workspace.id, user.id);

  t.is(role!.type, WorkspaceRole.Admin);

  await models.workspaceUser.set(
    workspace.id,
    user.id,
    WorkspaceRole.Collaborator
  );

  const role2 = await models.workspaceUser.get(workspace.id, user.id);

  t.is(role2!.type, WorkspaceRole.Collaborator);
  t.deepEqual(event.emit.lastCall.args, [
    'workspace.members.roleChanged',
    {
      userId: user.id,
      workspaceId: workspace.id,
      role: WorkspaceRole.Collaborator,
    },
  ]);
});

test('should return workspace role if status is Accepted', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const u1 = await module.create(Mockers.User);

  await models.workspaceUser.set(workspace.id, u1.id, WorkspaceRole.Admin);
  await models.workspaceUser.setStatus(
    workspace.id,
    u1.id,
    WorkspaceMemberStatus.Accepted
  );
  const role = await models.workspaceUser.get(workspace.id, u1.id);

  t.is(role!.type, WorkspaceRole.Admin);
});

test('should delete workspace user role', async t => {
  const workspace = await module.create(Mockers.Workspace);
  const u1 = await module.create(Mockers.User);

  await models.workspaceUser.set(workspace.id, u1.id, WorkspaceRole.Admin);
  await models.workspaceUser.setStatus(
    workspace.id,
    u1.id,
    WorkspaceMemberStatus.Accepted
  );

  let role = await models.workspaceUser.get(workspace.id, u1.id);
  t.is(role!.type, WorkspaceRole.Admin);

  await models.workspaceUser.delete(workspace.id, u1.id);

  role = await models.workspaceUser.get(workspace.id, u1.id);
  t.is(role, null);
});

test('should get user workspace roles with filter', async t => {
  const ws1 = await module.create(Mockers.Workspace);
  const ws2 = await module.create(Mockers.Workspace);
  const user = await module.create(Mockers.User);

  await db.workspaceUserRole.createMany({
    data: [
      {
        workspaceId: ws1.id,
        userId: user.id,
        type: WorkspaceRole.Admin,
        status: WorkspaceMemberStatus.Accepted,
      },
      {
        workspaceId: ws2.id,
        userId: user.id,
        type: WorkspaceRole.Collaborator,
        status: WorkspaceMemberStatus.Accepted,
      },
    ],
  });

  let roles = await models.workspaceUser.getUserActiveRoles(user.id, {
    role: WorkspaceRole.Admin,
  });
  t.is(roles.length, 1);
  t.is(roles[0].type, WorkspaceRole.Admin);

  roles = await models.workspaceUser.getUserActiveRoles(user.id);
  t.is(roles.length, 2);
});

test('should paginate workspace user roles', async t => {
  const workspace = await module.create(Mockers.Workspace);

  const users = await db.user.createManyAndReturn({
    data: Array.from({ length: 200 }, (_, i) => ({
      name: `u${i}`,
      email: `${randomBytes(10).toString('hex')}@affine.pro`,
    })),
  });

  await db.workspaceUserRole.createMany({
    data: users.map((user, i) => ({
      workspaceId: workspace.id,
      userId: user.id,
      type: WorkspaceRole.Collaborator,
      status: Object.values(WorkspaceMemberStatus)[
        Math.floor(Math.random() * Object.values(WorkspaceMemberStatus).length)
      ],
      createdAt: new Date(Date.now() + i * 1000),
    })),
  });

  const [roles, total] = await models.workspaceUser.paginate(workspace.id, {
    first: 10,
    offset: 0,
  });

  t.is(roles.length, 10);
  t.is(total, 200);

  const [roles2] = await models.workspaceUser.paginate(workspace.id, {
    after: roles.at(-1)?.createdAt.toISOString(),
    first: 50,
    offset: 0,
  });

  t.is(roles2.length, 50);
  t.deepEqual(
    roles2.map(r => r.id),
    roles2
      .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(r => r.id)
  );
});

test('should allocate seats for AllocatingSeat and NeedMoreSeat members', async t => {
  const users = await module.create(Mockers.User, 4);
  const workspace = await module.create(Mockers.Workspace);

  for (const user of users) {
    await module.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: user.id,
      status: WorkspaceMemberStatus.AllocatingSeat,
    });
  }

  await models.workspaceUser.allocateSeats(workspace.id, 1);

  let count = await db.workspaceUserRole.count({
    where: {
      workspaceId: workspace.id,
      status: WorkspaceMemberStatus.Pending,
    },
  });

  t.is(count, 1);

  await models.workspaceUser.allocateSeats(workspace.id, 3);

  count = await db.workspaceUserRole.count({
    where: {
      workspaceId: workspace.id,
      status: WorkspaceMemberStatus.Pending,
    },
  });

  t.is(count, 3);
});
