import { ok } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import { register } from 'prom-client';

import { AppModule } from '../app';
import {
  acceptInvite,
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

  // cleanup database before each test
  beforeEach(async () => {
    await client.$connect();
    await client.user.deleteMany({});
    await client.doc.deleteMany({});
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
  });

  afterEach(async () => {
    register.clear();
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
    ok(invite === true, 'failed to invite user');
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
});
