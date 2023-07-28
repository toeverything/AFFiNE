import { ok } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
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

describe('Workspace Module - invite', () => {
  let app: INestApplication;

  const client = new PrismaClient();

  let auth: AuthService;
  let mail: MailService;

  // cleanup database before each test
  beforeEach(async () => {
    await client.$connect();
    await client.user.deleteMany({});
    await client.snapshot.deleteMany({});
    await client.update.deleteMany({});
    await client.workspace.deleteMany({});
    await client.$disconnect();
  });

  beforeEach(async () => {
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

  afterEach(async () => {
    await app.close();
  });

  it('should invite a user', async () => {
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
    ok(!!invite, 'failed to invite user');
  });

  it('should accept an invite', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');

    const accept = await acceptInvite(app, u2.token.token, workspace.id);
    ok(accept === true, 'failed to accept invite');

    const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
    const currMember = currWorkspace.members.find(u => u.email === u2.email);
    ok(currMember !== undefined, 'failed to invite user');
    ok(currMember.id === u2.id, 'failed to invite user');
    ok(!currMember.accepted, 'failed to invite user');
  });

  it('should leave a workspace', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');
    await acceptInvite(app, u2.token.token, workspace.id);

    const leave = await leaveWorkspace(app, u2.token.token, workspace.id);
    ok(leave === true, 'failed to leave workspace');
  });

  it('should revoke a user', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');

    const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
    ok(currWorkspace.members.length === 2, 'failed to invite user');

    const revoke = await revokeUser(app, u1.token.token, workspace.id, u2.id);
    ok(revoke === true, 'failed to revoke user');
  });

  it('should create user if not exist', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);

    await inviteUser(
      app,
      u1.token.token,
      workspace.id,
      'u2@affine.pro',
      'Admin'
    );

    const user = await auth.getUserByEmail('u2@affine.pro');
    ok(user !== undefined, 'failed to create user');
    ok(user?.name === 'Unnamed', 'failed to create user');
  });

  it('should invite a user by link', async () => {
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
    ok(accept === true, 'failed to accept invite');

    const invite1 = await inviteUser(
      app,
      u1.token.token,
      workspace.id,
      u2.email,
      'Admin'
    );

    ok(invite === invite1, 'repeat the invitation must return same id');

    const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
    const currMember = currWorkspace.members.find(u => u.email === u2.email);
    ok(currMember !== undefined, 'failed to invite user');
    ok(currMember.inviteId === invite, 'failed to check invite id');
  });

  it('should send invite email', async () => {
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
  });
});
