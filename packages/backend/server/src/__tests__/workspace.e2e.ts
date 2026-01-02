import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';

import {
  acceptInviteById,
  createTestingApp,
  createWorkspace,
  getWorkspacePublicDocs,
  inviteUser,
  publishDoc,
  revokePublicDoc,
  setWorkspaceSharing,
  TestingApp,
  updateWorkspace,
} from './utils';

const test = ava as TestFn<{
  app: TestingApp;
  client: PrismaClient;
}>;

test.before(async t => {
  const app = await createTestingApp();

  t.context.client = app.get(PrismaClient);
  t.context.app = app;
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should create a workspace', async t => {
  const { app } = t.context;

  await app.signupV1('u1@affine.pro');
  const workspace = await createWorkspace(app);

  t.is(typeof workspace.id, 'string', 'workspace.id is not a string');
});

test('should be able to publish workspace', async t => {
  const { app } = t.context;
  await app.signupV1('u1@affine.pro');
  const workspace = await createWorkspace(app);
  const isPublic = await updateWorkspace(app, workspace.id, true);

  t.true(isPublic, 'failed to publish workspace');

  const isPrivate = await updateWorkspace(app, workspace.id, false);

  t.false(isPrivate, 'failed to unpublish workspace');
});

test('should visit public page', async t => {
  const { app } = t.context;
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const share = await publishDoc(app, workspace.id, 'doc1');

  t.is(share.id, 'doc1', 'failed to share doc');

  const docs = await getWorkspacePublicDocs(app, workspace.id);
  t.is(docs.length, 1, 'failed to get shared docs');
  t.deepEqual(
    docs[0],
    { id: 'doc1', mode: 'Page' },
    'failed to get shared doc: doc1'
  );

  const resp1 = await app.GET(
    `/api/workspaces/${workspace.id}/docs/${workspace.id}`
  );
  t.is(resp1.statusCode, 200, 'failed to get root doc with u1 token');
  const resp2 = await app.GET(
    `/api/workspaces/${workspace.id}/docs/${workspace.id}`
  );
  t.is(resp2.statusCode, 200, 'failed to get root doc with public pages');

  const resp3 = await app.GET(`/api/workspaces/${workspace.id}/docs/doc1`);
  // 404 because we don't put the page doc to server
  t.is(resp3.statusCode, 404, 'failed to get shared doc with u1 token');
  const resp4 = await app.GET(`/api/workspaces/${workspace.id}/docs/doc1`);
  // 404 because we don't put the page doc to server
  t.is(resp4.statusCode, 404, 'should not get shared doc without token');

  const revoke = await revokePublicDoc(app, workspace.id, 'doc1');
  t.false(revoke.public, 'failed to revoke doc');
  const docs2 = await getWorkspacePublicDocs(app, workspace.id);
  t.is(docs2.length, 0, 'failed to get shared docs');
  await t.throwsAsync(revokePublicDoc(app, workspace.id, 'doc3'), {
    message: 'Doc is not public.',
  });

  const docs3 = await getWorkspacePublicDocs(app, workspace.id);
  t.is(docs3.length, 0, 'failed to get shared docs');
});

test('should not be able to public not permitted doc', async t => {
  const { app } = t.context;

  await app.signupV1('u2@affine.pro');

  await t.throwsAsync(publishDoc(app, 'not_exists_ws', 'doc2'), {
    message:
      'You do not have permission to perform Doc.Publish action on doc doc2.',
  });

  await t.throwsAsync(revokePublicDoc(app, 'not_exists_ws', 'doc2'), {
    message:
      'You do not have permission to perform Doc.Publish action on doc doc2.',
  });
});

test('should be able to get workspace doc', async t => {
  const { app } = t.context;
  const u1 = await app.signupV1('u1@affine.pro');
  const u2 = await app.signupV1('u2@affine.pro');

  await app.switchUser(u1.id);
  const workspace = await createWorkspace(app);

  const res1 = await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(200)
    .type('application/octet-stream');

  t.deepEqual(
    res1.body,
    Buffer.from([0, 0]),
    'failed to get doc with u1 token'
  );

  await app.switchUser(u2.id);
  await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(403);
  await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(403);

  await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(403);

  await app.switchUser(u1.id);
  const invite = await inviteUser(app, workspace.id, u2.email);
  await app.switchUser(u2.id);
  await acceptInviteById(app, workspace.id, invite);

  const res2 = await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
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
  await app.signupV1('u1@affine.pro');

  const workspace = await createWorkspace(app);
  const isPublic = await updateWorkspace(app, workspace.id, true);

  t.true(isPublic, 'failed to publish workspace');

  const res = await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(200)
    .type('application/octet-stream');

  t.deepEqual(res.body, Buffer.from([0, 0]), 'failed to get public doc');

  const disabled = await setWorkspaceSharing(app, workspace.id, false);
  t.false(disabled, 'failed to disable workspace sharing');

  // owner should still be able to access
  await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(200);

  await app.logout();
  await app
    .GET(`/api/workspaces/${workspace.id}/docs/${workspace.id}`)
    .expect(403);
});
