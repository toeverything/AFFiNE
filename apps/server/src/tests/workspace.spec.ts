import { ok } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from '../app';
import {
  acceptInvite,
  createWorkspace,
  inviteUser,
  leaveWorkspace,
  listBlobs,
  revokePage,
  revokeUser,
  setBlob,
  sharePage,
  signUp,
  updateWorkspace,
} from './utils';

describe('Workspace Module', () => {
  let app: INestApplication;

  // cleanup database before each test
  beforeEach(async () => {
    const client = new PrismaClient();
    await client.$connect();
    await client.user.deleteMany({});
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
    await app.close();
  });

  it('should register a user', async () => {
    const user = await signUp(app, 'u1', 'u1@affine.pro', '123456');
    ok(typeof user.id === 'string', 'user.id is not a string');
    ok(user.name === 'u1', 'user.name is not valid');
    ok(user.email === 'u1@affine.pro', 'user.email is not valid');
  });

  it('should create a workspace', async () => {
    const user = await signUp(app, 'u1', 'u1@affine.pro', '1');

    const workspace = await createWorkspace(app, user.token.token);
    ok(typeof workspace.id === 'string', 'workspace.id is not a string');
  });

  it('should can publish workspace', async () => {
    const user = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const workspace = await createWorkspace(app, user.token.token);

    const isPublic = await updateWorkspace(
      app,
      user.token.token,
      workspace.id,
      true
    );
    ok(isPublic === true, 'failed to publish workspace');

    const isPrivate = await updateWorkspace(
      app,
      user.token.token,
      workspace.id,
      false
    );
    ok(isPrivate === false, 'failed to unpublish workspace');
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

    const revoke = await revokeUser(app, u1.token.token, workspace.id, u2.id);
    ok(revoke === true, 'failed to revoke user');
  });

  it('should share a page', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);

    const share = await sharePage(app, u1.token.token, workspace.id, 'page1');
    ok(share === true, 'failed to share page');

    const msg1 = await sharePage(app, u2.token.token, workspace.id, 'page2');
    ok(msg1 === 'Permission denied', 'unauthorized user can share page');
    const msg2 = await revokePage(
      app,
      u2.token.token,
      'not_exists_ws',
      'page2'
    );
    ok(msg2 === 'Permission denied', 'unauthorized user can share page');

    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');
    await acceptInvite(app, u2.token.token, workspace.id);
    const invited = await sharePage(app, u2.token.token, workspace.id, 'page2');
    ok(invited === true, 'failed to share page');

    const revoke = await revokePage(app, u1.token.token, workspace.id, 'page1');
    ok(revoke === true, 'failed to revoke page');

    const msg3 = await revokePage(app, u1.token.token, workspace.id, 'page3');
    ok(msg3 === false, 'can revoke non-exists page');
  });

  it('should list blobs', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    const blobs = await listBlobs(app, u1.token.token, workspace.id);
    ok(blobs.length === 0, 'failed to list blobs');

    const buffer = Buffer.from([0, 0]);
    const hash = await setBlob(app, u1.token.token, workspace.id, buffer);

    const ret = await listBlobs(app, u1.token.token, workspace.id);
    ok(ret.length === 1, 'failed to list blobs');
    ok(ret[0] === hash, 'failed to list blobs');
  });
});
