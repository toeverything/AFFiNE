import { deepEqual, ok, rejects } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../app';
import {
  acceptInvite,
  createWorkspace,
  getPublicWorkspace,
  getWorkspaceSharedPages,
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
    await client.update.deleteMany({});
    await client.snapshot.deleteMany({});
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
    const pages = await getWorkspaceSharedPages(
      app,
      u1.token.token,
      workspace.id
    );
    ok(pages.length === 1, 'failed to get shared pages');
    ok(pages[0] === 'page1', 'failed to get shared page: page1');

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
    const pages2 = await getWorkspaceSharedPages(
      app,
      u1.token.token,
      workspace.id
    );
    ok(pages2.length === 1, 'failed to get shared pages');
    ok(pages2[0] === 'page2', 'failed to get shared page: page2');

    const msg3 = await revokePage(app, u1.token.token, workspace.id, 'page3');
    ok(msg3 === false, 'can revoke non-exists page');

    const msg4 = await revokePage(app, u1.token.token, workspace.id, 'page2');
    ok(msg4 === true, 'failed to revoke page');
    const page3 = await getWorkspaceSharedPages(
      app,
      u1.token.token,
      workspace.id
    );
    ok(page3.length === 0, 'failed to get shared pages');
  });

  it('should can get workspace doc', async () => {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '2');
    const workspace = await createWorkspace(app, u1.token.token);

    const res1 = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
      .auth(u1.token.token, { type: 'bearer' })
      .expect(200)
      .type('application/octet-stream');

    deepEqual(
      res1.body,
      Buffer.from([0, 0]),
      'failed to get doc with u1 token'
    );

    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
      .auth(u2.token.token, { type: 'bearer' })
      .expect(403);

    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
      .auth(u2.token.token, { type: 'bearer' })
      .expect(403);

    await acceptInvite(app, u2.token.token, workspace.id);
    const res2 = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
      .auth(u2.token.token, { type: 'bearer' })
      .expect(200)
      .type('application/octet-stream');

    deepEqual(
      res2.body,
      Buffer.from([0, 0]),
      'failed to get doc with u2 token'
    );
  });

  it('should be able to get public workspace doc', async () => {
    const user = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const workspace = await createWorkspace(app, user.token.token);

    const isPublic = await updateWorkspace(
      app,
      user.token.token,
      workspace.id,
      true
    );

    ok(isPublic === true, 'failed to publish workspace');

    const res = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
      .expect(200)
      .type('application/octet-stream');

    deepEqual(res.body, Buffer.from([0, 0]), 'failed to get public doc');
  });
});
