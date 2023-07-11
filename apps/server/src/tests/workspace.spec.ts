import { ok, rejects } from 'node:assert';
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
  getPublicWorkspace,
  inviteUser,
  revokePage,
  sharePage,
  signUp,
  updateWorkspace,
} from './utils';

describe('Workspace Module', () => {
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

  it('should can read published workspace', async () => {
    const user = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const workspace = await createWorkspace(app, user.token.token);

    rejects(
      getPublicWorkspace(app, 'not_exists_ws'),
      'must not get not exists workspace'
    );
    rejects(
      getPublicWorkspace(app, workspace.id),
      'must not get private workspace'
    );

    await updateWorkspace(app, user.token.token, workspace.id, true);

    const publicWorkspace = await getPublicWorkspace(app, workspace.id);
    ok(publicWorkspace.id === workspace.id, 'failed to get public workspace');
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
});
