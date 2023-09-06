import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from '../app';
import { MailService } from '../modules/auth/mailer';
import { AuthService } from '../modules/auth/service';
import {
  acceptInvite,
  acceptInviteById,
  createWorkspace,
  getWorkspace,
  inviteUser,
  leaveWorkspace,
  revokeUser,
  signUp,
} from './utils';

let app: INestApplication;

const client = new PrismaClient();

let auth: AuthService;
let mail: MailService;

// cleanup database before each test
test.beforeEach(async () => {
  await client.$connect();
  await client.user.deleteMany({});
  await client.snapshot.deleteMany({});
  await client.update.deleteMany({});
  await client.workspace.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();

  auth = module.get(AuthService);
  mail = module.get(MailService);
});

test.afterEach(async () => {
  await app.close();
});

test('should invite a user', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const invite = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );
  t.truthy(invite, 'failed to invite user');
});

test('should accept an invite', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');

  const accept = await acceptInvite(app, u2.token.token, workspace.id);
  t.is(accept, true, 'failed to accept invite');

  const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
  const currMember = currWorkspace.members.find(u => u.email === u2.email);
  t.not(currMember, undefined, 'failed to invite user');
  t.is(currMember!.id, u2.id, 'failed to invite user');
  t.true(!currMember!.accepted, 'failed to invite user');
  t.pass();
});

test('should leave a workspace', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');
  await acceptInvite(app, u2.token.token, workspace.id);

  const leave = await leaveWorkspace(app, u2.token.token, workspace.id);
  t.true(leave, 'failed to leave workspace');
});

test('should revoke a user', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');

  const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
  t.is(currWorkspace.members.length, 2, 'failed to invite user');

  const revoke = await revokeUser(app, u1.token.token, workspace.id, u2.id);
  t.true(revoke, 'failed to revoke user');
});

test('should create user if not exist', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  await inviteUser(app, u1.token.token, workspace.id, 'u2@affine.pro', 'Admin');

  const user = await auth.getUserByEmail('u2@affine.pro');
  t.not(user, undefined, 'failed to create user');
  t.is(user?.name, 'Unnamed', 'failed to create user');
});

test('should invite a user by link', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const invite = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );

  const accept = await acceptInviteById(app, workspace.id, invite);
  t.true(accept, 'failed to accept invite');

  const invite1 = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );

  t.is(invite, invite1, 'repeat the invitation must return same id');

  const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
  const currMember = currWorkspace.members.find(u => u.email === u2.email);
  t.not(currMember, undefined, 'failed to invite user');
  t.is(currMember?.inviteId, invite, 'failed to check invite id');
});

test('should send invite email', async t => {
  if (mail.hasConfigured()) {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'test', 'production@toeverything.info', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    await inviteUser(
      app,
      u1.token.token,
      workspace.id,
      u2.email,
      'Admin',
      true
    );
  }
  t.pass();
});

test('should support pagination for member', async t => {
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');
  const u3 = await signUp(app, 'u3', 'u3@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');
  await inviteUser(app, u1.token.token, workspace.id, u3.email, 'Admin');

  await acceptInvite(app, u2.token.token, workspace.id);
  await acceptInvite(app, u3.token.token, workspace.id);

  const firstPageWorkspace = await getWorkspace(
    app,
    u1.token.token,
    workspace.id,
    0,
    2
  );
  t.is(firstPageWorkspace.members.length, 2, 'failed to check invite id');
  const secondPageWorkspace = await getWorkspace(
    app,
    u1.token.token,
    workspace.id,
    2,
    2
  );
  t.is(secondPageWorkspace.members.length, 1, 'failed to check invite id');
});
