import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';
import request from 'supertest';

import { AppModule } from '../src/app';
import {
  acceptInviteById,
  createWorkspace,
  currentUser,
  getPublicWorkspace,
  getWorkspacePublicPages,
  inviteUser,
  publishPage,
  revokePublicPage,
  signUp,
  updateWorkspace,
} from './utils';

const test = ava as TestFn<{
  app: INestApplication;
  client: PrismaClient;
}>;

test.beforeEach(async t => {
  const client = new PrismaClient();
  await client.$connect();
  await client.user.deleteMany({});
  await client.update.deleteMany({});
  await client.snapshot.deleteMany({});
  await client.workspace.deleteMany({});
  await client.$disconnect();
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();
  t.context.client = client;
  t.context.app = app;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should register a user', async t => {
  const user = await signUp(t.context.app, 'u1', 'u1@affine.pro', '123456');
  t.is(typeof user.id, 'string', 'user.id is not a string');
  t.is(user.name, 'u1', 'user.name is not valid');
  t.is(user.email, 'u1@affine.pro', 'user.email is not valid');
});

test.skip('should be throttled at call signUp', async t => {
  const { app } = t.context;
  let token = '';
  for (let i = 0; i < 10; i++) {
    token = (await signUp(app, `u${i}`, `u${i}@affine.pro`, `${i}`)).token
      .token;
    // throttles are applied to each endpoint separately
    await currentUser(app, token);
  }
  await t.throwsAsync(() => signUp(app, 'u11', 'u11@affine.pro', '11'));
  await t.throwsAsync(() => currentUser(app, token));
});

test('should create a workspace', async t => {
  const { app } = t.context;
  const user = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, user.token.token);
  t.is(typeof workspace.id, 'string', 'workspace.id is not a string');
});

test('should can publish workspace', async t => {
  const { app } = t.context;
  const user = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const workspace = await createWorkspace(app, user.token.token);

  const isPublic = await updateWorkspace(
    app,
    user.token.token,
    workspace.id,
    true
  );
  t.true(isPublic, 'failed to publish workspace');

  const isPrivate = await updateWorkspace(
    app,
    user.token.token,
    workspace.id,
    false
  );
  t.false(isPrivate, 'failed to unpublish workspace');
});

test('should can read published workspace', async t => {
  const { app } = t.context;
  const user = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const workspace = await createWorkspace(app, user.token.token);

  await t.throwsAsync(() => getPublicWorkspace(app, 'not_exists_ws'));
  await t.throwsAsync(() => getPublicWorkspace(app, workspace.id));

  await updateWorkspace(app, user.token.token, workspace.id, true);

  const publicWorkspace = await getPublicWorkspace(app, workspace.id);
  t.is(publicWorkspace.id, workspace.id, 'failed to get public workspace');
});

test('should share a page', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const share = await publishPage(app, u1.token.token, workspace.id, 'page1');
  t.is(share.id, 'page1', 'failed to share page');
  const pages = await getWorkspacePublicPages(
    app,
    u1.token.token,
    workspace.id
  );
  t.is(pages.length, 1, 'failed to get shared pages');
  t.deepEqual(
    pages[0],
    { id: 'page1', mode: 'Page' },
    'failed to get shared page: page1'
  );

  const resp1 = await request(app.getHttpServer())
    .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .auth(u1.token.token, { type: 'bearer' });
  t.is(resp1.statusCode, 200, 'failed to get root doc with u1 token');
  const resp2 = await request(app.getHttpServer()).get(
    `/api/workspaces/${workspace.id}/docs/${workspace.id}`
  );
  t.is(resp2.statusCode, 200, 'failed to get root doc with public pages');

  const resp3 = await request(app.getHttpServer())
    .get(`/api/workspaces/${workspace.id}/docs/page1`)
    .auth(u1.token.token, { type: 'bearer' });
  // 404 because we don't put the page doc to server
  t.is(resp3.statusCode, 404, 'failed to get shared doc with u1 token');
  const resp4 = await request(app.getHttpServer()).get(
    `/api/workspaces/${workspace.id}/docs/page1`
  );
  // 404 because we don't put the page doc to server
  t.is(resp4.statusCode, 404, 'should not get shared doc without token');

  const msg1 = await publishPage(app, u2.token.token, 'not_exists_ws', 'page2');
  t.is(msg1, 'Permission denied', 'unauthorized user can share page');
  const msg2 = await revokePublicPage(
    app,
    u2.token.token,
    'not_exists_ws',
    'page2'
  );
  t.is(msg2, 'Permission denied', 'unauthorized user can share page');

  await acceptInviteById(
    app,
    workspace.id,
    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin')
  );
  const invited = await publishPage(app, u2.token.token, workspace.id, 'page2');
  t.is(invited.id, 'page2', 'failed to share page');

  const revoke = await revokePublicPage(
    app,
    u1.token.token,
    workspace.id,
    'page1'
  );
  t.false(revoke.public, 'failed to revoke page');
  const pages2 = await getWorkspacePublicPages(
    app,
    u1.token.token,
    workspace.id
  );
  t.is(pages2.length, 1, 'failed to get shared pages');
  t.is(pages2[0].id, 'page2', 'failed to get shared page: page2');

  const msg3 = await revokePublicPage(
    app,
    u1.token.token,
    workspace.id,
    'page3'
  );
  t.is(msg3, 'Page is not public');

  const msg4 = await revokePublicPage(
    app,
    u1.token.token,
    workspace.id,
    'page2'
  );
  t.false(msg4.public, 'failed to revoke page');
  const page3 = await getWorkspacePublicPages(
    app,
    u1.token.token,
    workspace.id
  );
  t.is(page3.length, 0, 'failed to get shared pages');
});

test('should can get workspace doc', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '2');
  const workspace = await createWorkspace(app, u1.token.token);

  const res1 = await request(app.getHttpServer())
    .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .auth(u1.token.token, { type: 'bearer' })
    .expect(200)
    .type('application/octet-stream');

  t.deepEqual(
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

  await request(app.getHttpServer())
    .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .auth(u2.token.token, { type: 'bearer' })
    .expect(403);

  await acceptInviteById(
    app,
    workspace.id,
    await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin')
  );

  const res2 = await request(app.getHttpServer())
    .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .auth(u2.token.token, { type: 'bearer' })
    .expect(200)
    .type('application/octet-stream');

  t.deepEqual(
    res2.body,
    Buffer.from([0, 0]),
    'failed to get doc with u2 token'
  );
});

test('should be able to get public workspace doc', async t => {
  const { app } = t.context;
  const user = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const workspace = await createWorkspace(app, user.token.token);

  const isPublic = await updateWorkspace(
    app,
    user.token.token,
    workspace.id,
    true
  );

  t.true(isPublic, 'failed to publish workspace');

  const res = await request(app.getHttpServer())
    .get(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(200)
    .type('application/octet-stream');

  t.deepEqual(res.body, Buffer.from([0, 0]), 'failed to get public doc');
});
