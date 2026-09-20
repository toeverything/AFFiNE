import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';
import Sinon from 'sinon';

import { EventBus } from '../../base';
import { Models } from '../../models';
import { UserModel } from '../../models/user';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  models: Models;
  db: PrismaClient;
  user: UserModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({});

  t.context.user = module.get(UserModel);
  t.context.models = module.get(Models);
  t.context.db = module.get(PrismaClient);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after(async t => {
  await t.context.module.close();
});

test('should create a new user', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  t.is(user.email, 'test@affine.pro');

  const user2 = await t.context.user.getUserByEmail('test@affine.pro');

  t.not(user2, null);
  t.is(user2!.email, 'test@affine.pro');
});

test('should trigger user.created event', async t => {
  const event = t.context.module.get(EventBus);
  const spy = Sinon.spy();
  event.on('user.created', spy);

  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  t.true(spy.calledOnce);
  t.is(spy.firstCall.args[0].id, user.id);
});

test('should trigger user.updated event', async t => {
  const event = t.context.module.get(EventBus);
  const spy = Sinon.spy();
  event.on('user.updated', spy);

  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const updatedUser = await t.context.user.updateProfile(user.id, {
    name: 'new name',
  });

  t.true(spy.calledOnceWithExactly(updatedUser));
});

test('should get user by id', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const user2 = await t.context.user.get(user.id);

  t.not(user2, null);
  t.is(user2!.id, user.id);
});

test('should get public user by id', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const publicUser = await t.context.user.getPublicUser(user.id);

  t.not(publicUser, null);
  t.is(publicUser!.id, user.id);
  t.true(!('password' in publicUser!));
  t.true(!('email' in publicUser!));
});

test('should get public user by email', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const publicUser = await t.context.user.getPublicUserByEmail(user.email);

  t.not(publicUser, null);
  t.is(publicUser!.id, user.id);
  t.true(!('password' in publicUser!));
  t.true(!('email' in publicUser!));
});

test('should get workspace user by id', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const workspaceUser = await t.context.user.getWorkspaceUser(user.id);

  t.not(workspaceUser, null);
  t.is(workspaceUser!.id, user.id);
  t.true(!('password' in workspaceUser!));
  t.is(workspaceUser!.email, user.email);
});

test('should get user by email', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const user2 = await t.context.user.getUserByEmail(user.email);

  t.not(user2, null);
  t.is(user2!.id, user.id);
});

test('should ignore case when getting user by email', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  const user2 = await t.context.user.getUserByEmail('TEST@affine.pro');

  t.not(user2, null);
  t.is(user2!.id, user.id);
});

test('should return null for non existing user', async t => {
  const user = await t.context.user.getUserByEmail('test@affine.pro');

  t.is(user, null);
});

test('should delete user', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });

  await t.context.user.delete(user.id);

  const user2 = await t.context.user.get(user.id);

  t.is(user2, null);
});

test('should delete user with pending invitation missing normalized email', async t => {
  const owner = await t.context.user.create({
    email: 'owner@affine.pro',
  });
  const invitee = await t.context.user.create({
    email: 'invitee@affine.pro',
    registered: false,
  });
  const workspace = await t.context.models.workspace.create(owner.id);

  const invitation = await t.context.db.workspaceInvitation.create({
    data: {
      workspaceId: workspace.id,
      inviteeUserId: invitee.id,
      inviterUserId: owner.id,
      requestedRole: 'member',
      status: 'pending',
      kind: 'email',
    },
  });

  await t.context.user.delete(invitee.id);

  t.is(
    await t.context.db.workspaceInvitation.findUnique({
      where: { id: invitation.id },
    }),
    null
  );
  t.is(await t.context.user.get(invitee.id), null);
});

test('should trigger user.deleted event', async t => {
  const event = t.context.module.get(EventBus);
  const notification = event.waitFor('user.deleted', 1_000);

  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const workspace = await t.context.models.workspace.create(user.id);

  const deleted = await t.context.user.delete(user.id);

  t.deepEqual(await notification, [deleted]);
  t.is(await t.context.models.workspace.get(workspace.id), null);
});

test('should paginate users', async t => {
  const now = Date.now();
  await Promise.all(
    Array.from({ length: 100 }).map((_, i) =>
      t.context.user.create({
        name: `test-paginate-${i}`,
        email: `test-paginate-${i}@affine.pro`,
        createdAt: new Date(now + i),
        disabled: i % 2 === 0,
      })
    )
  );

  const users = await t.context.user.list({ skip: 0, take: 10 });
  t.is(users.length, 10);
  t.deepEqual(
    users.map(user => user.email),
    Array.from({ length: 10 }).map((_, i) => `test-paginate-${i}@affine.pro`)
  );
});

// #region disabled user
test('should not get disabled user by default', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
    disabled: true,
  });

  const user2 = await t.context.user.get(user.id);
  const user3 = await t.context.user.getPublicUser(user.id);
  const user4 = await t.context.user.getPublicUserByEmail(user.email);
  const userList1 = await t.context.user.getPublicUsers([user.id]);
  const user5 = await t.context.user.getWorkspaceUser(user.id);
  const userList2 = await t.context.user.getWorkspaceUsers([user.id]);

  t.is(user2, null);
  t.is(user3, null);
  t.is(user4, null);
  t.is(user5, null);
  t.is(userList1.length, 0);
  t.is(userList2.length, 0);
});

test('should get disabled user `withDisabled`', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
    disabled: true,
  });

  const user2 = await t.context.user.get(user.id, { withDisabled: true });
  const user3 = await t.context.user.getUserByEmail(user.email, {
    withDisabled: true,
  });

  t.is(user2!.id, user.id);
  t.is(user3!.id, user.id);
});

// #endregion
