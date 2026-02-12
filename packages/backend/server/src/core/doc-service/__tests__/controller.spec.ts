import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import { User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { CryptoHelper } from '../../../base';
import { Models } from '../../../models';
import { DatabaseDocReader } from '../../doc';

const test = ava as TestFn<{
  models: Models;
  app: TestingApp;
  crypto: CryptoHelper;
  databaseDocReader: DatabaseDocReader;
}>;

test.before(async t => {
  const app = await createTestingApp();

  t.context.models = app.get(Models);
  t.context.crypto = app.get(CryptoHelper);
  t.context.app = app;
  t.context.databaseDocReader = app.get(DatabaseDocReader);
});

let user: User;
let workspace: Workspace;

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
  user = await t.context.models.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.models.workspace.create(user.id);
});

test.afterEach.always(async () => {
  mock.reset();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should forbid access to rpc api without access token', async t => {
  const { app } = t.context;

  await app
    .GET('/rpc/workspaces/123/docs/123')
    .expect({
      status: 403,
      code: 'Forbidden',
      type: 'NO_PERMISSION',
      name: 'ACCESS_DENIED',
      message: 'Invalid internal request',
    })
    .expect(403);
  t.pass();
});

test('should forbid access to rpc api with invalid access token', async t => {
  const { app } = t.context;

  await app
    .GET('/rpc/workspaces/123/docs/123')
    .set('x-access-token', 'invalid,wrong-signature')
    .expect({
      status: 403,
      code: 'Forbidden',
      type: 'NO_PERMISSION',
      name: 'ACCESS_DENIED',
      message: 'Invalid internal request',
    })
    .expect(403);
  t.pass();
});

test('should forbid replayed internal access token', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}`;
  const token = t.context.crypto.signInternalAccessToken({
    method: 'GET',
    path,
    nonce: `nonce-${randomUUID()}`,
  });

  await app.GET(path).set('x-access-token', token).expect(404);

  await app
    .GET(path)
    .set('x-access-token', token)
    .expect({
      status: 403,
      code: 'Forbidden',
      type: 'NO_PERMISSION',
      name: 'ACCESS_DENIED',
      message: 'Invalid internal request',
    })
    .expect(403);
  t.pass();
});

test('should forbid internal access token when method mismatched', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}/diff`;
  await app
    .POST(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect({
      status: 403,
      code: 'Forbidden',
      type: 'NO_PERMISSION',
      name: 'ACCESS_DENIED',
      message: 'Invalid internal request',
    })
    .expect(403);
  t.pass();
});

test('should forbid internal access token when path mismatched', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const wrongPath = `/rpc/workspaces/${workspaceId}/docs/${docId}`;
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}/content`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({
        method: 'GET',
        path: wrongPath,
      })
    )
    .expect({
      status: 403,
      code: 'Forbidden',
      type: 'NO_PERMISSION',
      name: 'ACCESS_DENIED',
      message: 'Invalid internal request',
    })
    .expect(403);
  t.pass();
});

test('should forbid internal access token when expired', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({
        method: 'GET',
        path,
        now: Date.now() - 10 * 60 * 1000,
        nonce: `nonce-${randomUUID()}`,
      })
    )
    .expect({
      status: 403,
      code: 'Forbidden',
      type: 'NO_PERMISSION',
      name: 'ACCESS_DENIED',
      message: 'Invalid internal request',
    })
    .expect(403);
  t.pass();
});

test('should 404 when doc not found', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect({
      status: 404,
      code: 'Not Found',
      type: 'RESOURCE_NOT_FOUND',
      name: 'NOT_FOUND',
      message: 'Doc not found',
    })
    .expect(404);
  t.pass();
});

test('should return doc when found', async t => {
  const { app } = t.context;

  const docId = randomUUID();
  const timestamp = Date.now();
  await t.context.models.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob1 data'),
      timestamp,
      editorId: user.id,
    },
  ]);

  const path = `/rpc/workspaces/${workspace.id}/docs/${docId}`;
  const res = await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .set('x-cloud-trace-context', 'test-trace-id/span-id')
    .expect(200)
    .expect('x-request-id', 'test-trace-id')
    .expect('Content-Type', 'application/octet-stream');
  const bin = res.body as Buffer;
  t.is(bin.toString(), 'blob1 data');
  t.is(res.headers['x-doc-timestamp'], timestamp.toString());
  t.is(res.headers['x-doc-editor-id'], user.id);
});

test('should 404 when doc diff not found', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}/diff`;
  await app
    .POST(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'POST', path })
    )
    .expect({
      status: 404,
      code: 'Not Found',
      type: 'RESOURCE_NOT_FOUND',
      name: 'NOT_FOUND',
      message: 'Doc not found',
    })
    .expect(404);
  t.pass();
});

test('should 404 when doc content not found', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}/content`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect({
      status: 404,
      code: 'Not Found',
      type: 'RESOURCE_NOT_FOUND',
      name: 'NOT_FOUND',
      message: 'Doc not found',
    })
    .expect(404);
  t.pass();
});

test('should get doc content in json format', async t => {
  const { app } = t.context;
  mock.method(t.context.databaseDocReader, 'getDocContent', async () => {
    return {
      title: 'test title',
      summary: 'test summary',
    };
  });

  const docId = randomUUID();
  const path = `/rpc/workspaces/${workspace.id}/docs/${docId}/content`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect('Content-Type', 'application/json; charset=utf-8')
    .expect({
      title: 'test title',
      summary: 'test summary',
    })
    .expect(200);

  await app
    .GET(`${path}?full=false`)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect('Content-Type', 'application/json; charset=utf-8')
    .expect({
      title: 'test title',
      summary: 'test summary',
    })
    .expect(200);
  t.pass();
});

test('should get full doc content in json format', async t => {
  const { app } = t.context;
  mock.method(t.context.databaseDocReader, 'getFullDocContent', async () => {
    return {
      title: 'test title',
      summary: 'test summary full',
    };
  });

  const docId = randomUUID();
  const path = `/rpc/workspaces/${workspace.id}/docs/${docId}/content`;
  await app
    .GET(`${path}?full=true`)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect('Content-Type', 'application/json; charset=utf-8')
    .expect({
      title: 'test title',
      summary: 'test summary full',
    })
    .expect(200);
  t.pass();
});

test('should 404 when workspace content not found', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const path = `/rpc/workspaces/${workspaceId}/content`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect({
      status: 404,
      code: 'Not Found',
      type: 'RESOURCE_NOT_FOUND',
      name: 'NOT_FOUND',
      message: 'Workspace not found',
    })
    .expect(404);
  t.pass();
});

test('should get workspace content in json format', async t => {
  const { app } = t.context;
  mock.method(t.context.databaseDocReader, 'getWorkspaceContent', async () => {
    return {
      name: 'test name',
      avatarKey: 'avatar key',
    };
  });

  const workspaceId = randomUUID();
  const path = `/rpc/workspaces/${workspaceId}/content`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect(200)
    .expect({
      name: 'test name',
      avatarKey: 'avatar key',
    });
  t.pass();
});

test('should get doc markdown in json format', async t => {
  const { app } = t.context;
  mock.method(t.context.databaseDocReader, 'getDocMarkdown', async () => {
    return {
      title: 'test title',
      markdown: 'test markdown',
    };
  });

  const docId = randomUUID();
  const path = `/rpc/workspaces/${workspace.id}/docs/${docId}/markdown`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect('Content-Type', 'application/json; charset=utf-8')
    .expect(200)
    .expect({
      title: 'test title',
      markdown: 'test markdown',
    });
  t.pass();
});

test('should 404 when doc markdown not found', async t => {
  const { app } = t.context;

  const workspaceId = '123';
  const docId = '123';
  const path = `/rpc/workspaces/${workspaceId}/docs/${docId}/markdown`;
  await app
    .GET(path)
    .set(
      'x-access-token',
      t.context.crypto.signInternalAccessToken({ method: 'GET', path })
    )
    .expect({
      status: 404,
      code: 'Not Found',
      type: 'RESOURCE_NOT_FOUND',
      name: 'NOT_FOUND',
      message: 'Doc not found',
    })
    .expect(404);
  t.pass();
});
