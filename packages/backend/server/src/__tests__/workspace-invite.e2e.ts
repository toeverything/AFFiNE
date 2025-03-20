import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';

import { AuthService } from '../core/auth/service';
import { Models } from '../models';
import {
  acceptInviteById,
  createTestingApp,
  createWorkspace,
  getWorkspace,
  inviteUser,
  leaveWorkspace,
  revokeUser,
  TestingApp,
} from './utils';

const test = ava as TestFn<{
  app: TestingApp;
  client: PrismaClient;
  auth: AuthService;
  models: Models;
}>;

test.before(async t => {
  const app = await createTestingApp();
  t.context.app = app;
  t.context.client = app.get(PrismaClient);
  t.context.auth = app.get(AuthService);
  t.context.models = app.get(Models);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should invite a user', async t => {
  const { app } = t.context;
  const u2 = await app.signupV1('u2@affine.pro');
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  const invite = await inviteUser(app, workspace.id, u2.email);
  t.truthy(invite, 'failed to invite user');
});

test('should leave a workspace', async t => {
  const { app } = t.context;
  const u2 = await app.signupV1('u2@affine.pro');
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const invite = await inviteUser(app, workspace.id, u2.email);

  app.switchUser(u2.id);
  await acceptInviteById(app, workspace.id, invite);

  const leave = await leaveWorkspace(app, workspace.id);

  t.true(leave, 'failed to leave workspace');
});

test('should revoke a user', async t => {
  const { app } = t.context;
  const u2 = await app.signupV1('u2@affine.pro');
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  await inviteUser(app, workspace.id, u2.email);

  const currWorkspace = await getWorkspace(app, workspace.id);
  t.is(currWorkspace.members.length, 2, 'failed to invite user');

  const revoke = await revokeUser(app, workspace.id, u2.id);
  t.true(revoke, 'failed to revoke user');
});

test('should create user if not exist', async t => {
  const { app, models } = t.context;
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  await inviteUser(app, workspace.id, 'u2@affine.pro');

  const u2 = await models.user.getUserByEmail('u2@affine.pro');
  t.not(u2, undefined, 'failed to create user');
  t.is(u2?.name, 'u2', 'failed to create user');
});

test('should invite a user by link', async t => {
  const { app } = t.context;
  const u2 = await app.signupV1('u2@affine.pro');
  const u1 = await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);

  const invite = await inviteUser(app, workspace.id, u2.email);

  app.switchUser(u2.id);
  const accept = await acceptInviteById(app, workspace.id, invite);
  t.true(accept, 'failed to accept invite');

  app.switchUser(u1.id);
  const invite1 = await inviteUser(app, workspace.id, u2.email);

  t.is(invite, invite1, 'repeat the invitation must return same id');

  const currWorkspace = await getWorkspace(app, workspace.id);
  const currMember = currWorkspace.members.find(u => u.email === u2.email);
  t.not(currMember, undefined, 'failed to invite user');
  t.is(currMember?.inviteId, invite, 'failed to check invite id');
});

test('should send email', async t => {
  const { app } = t.context;
  const u2 = await app.signupV1('u2@affine.pro');
  const u1 = await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const invite = await inviteUser(app, workspace.id, u2.email, true);

  const invitationMail = app.mails.last('MemberInvitation');

  t.is(invitationMail.name, 'MemberInvitation');
  t.is(invitationMail.to, u2.email);

  app.switchUser(u2.id);
  await acceptInviteById(app, workspace.id, invite, true);

  const acceptedMail = app.mails.last('MemberAccepted');
  t.is(acceptedMail.to, u1.email);
  t.is(acceptedMail.props.user.$$userId, u2.id);

  await leaveWorkspace(app, workspace.id, true);

  const leaveMail = app.mails.last('MemberLeave');

  t.is(leaveMail.to, u1.email);
  t.is(leaveMail.props.user.$$userId, u2.id);
});

test('should support pagination for member', async t => {
  const { app } = t.context;
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  await inviteUser(app, workspace.id, 'u2@affine.pro');
  await inviteUser(app, workspace.id, 'u3@affine.pro');

  const firstPageWorkspace = await getWorkspace(app, workspace.id, 0, 2);
  t.is(firstPageWorkspace.members.length, 2, 'failed to check invite id');
  const secondPageWorkspace = await getWorkspace(app, workspace.id, 2, 2);
  t.is(secondPageWorkspace.members.length, 1, 'failed to check invite id');
});

test('should limit member count correctly', async t => {
  const { app } = t.context;
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  await Promise.allSettled(
    Array.from({ length: 10 }).map(async (_, i) =>
      inviteUser(app, workspace.id, `u${i}@affine.pro`)
    )
  );
  const ws = await getWorkspace(app, workspace.id);
  t.assert(ws.members.length <= 3, 'failed to check member list');
});
