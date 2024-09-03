import { Readable } from 'node:stream';

import { HttpStatus, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { CurrentUser } from '../../src/core/auth';
import { AuthService } from '../../src/core/auth/service';
import { PgWorkspaceDocStorageAdapter } from '../../src/core/doc';
import { WorkspaceBlobStorage } from '../../src/core/storage';
import { createTestingApp, internalSignIn } from '../utils';

const test = ava as TestFn<{
  u1: CurrentUser;
  db: PrismaClient;
  app: INestApplication;
  storage: Sinon.SinonStubbedInstance<WorkspaceBlobStorage>;
  workspace: Sinon.SinonStubbedInstance<PgWorkspaceDocStorageAdapter>;
}>;

test.before(async t => {
  const { app } = await createTestingApp({
    imports: [AppModule],
    tapModule: m => {
      m.overrideProvider(WorkspaceBlobStorage)
        .useValue(Sinon.createStubInstance(WorkspaceBlobStorage))
        .overrideProvider(PgWorkspaceDocStorageAdapter)
        .useValue(Sinon.createStubInstance(PgWorkspaceDocStorageAdapter));
    },
  });

  const auth = app.get(AuthService);
  t.context.u1 = await auth.signUp('u1@affine.pro', '1');
  const db = app.get(PrismaClient);

  t.context.db = db;
  t.context.app = app;
  t.context.storage = app.get(WorkspaceBlobStorage);
  t.context.workspace = app.get(PgWorkspaceDocStorageAdapter);

  await db.workspacePage.create({
    data: {
      workspace: {
        create: {
          id: 'public',
          public: true,
        },
      },
      pageId: 'private',
      public: false,
    },
  });

  await db.workspacePage.create({
    data: {
      workspace: {
        create: {
          id: 'private',
          public: false,
        },
      },
      pageId: 'public',
      public: true,
    },
  });

  await db.workspacePage.create({
    data: {
      workspace: {
        create: {
          id: 'totally-private',
          public: false,
        },
      },
      pageId: 'private',
      public: false,
    },
  });
});

test.after.always(async t => {
  await t.context.app.close();
});

function blob() {
  function stream() {
    return Readable.from(Buffer.from('blob'));
  }

  const init = stream();
  const ret = {
    body: init,
    metadata: {
      contentType: 'text/plain',
      lastModified: new Date(),
      contentLength: 4,
    },
  };

  init.on('end', () => {
    ret.body = stream();
  });

  return ret;
}

// blob
test('should be able to get blob from public workspace', async t => {
  const { app, u1, storage } = t.context;

  // no authenticated user
  storage.get.resolves(blob());
  let res = await request(t.context.app.getHttpServer()).get(
    '/api/workspaces/public/blobs/test'
  );

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');

  // authenticated user
  const cookie = await internalSignIn(app, u1.id);
  res = await request(t.context.app.getHttpServer())
    .get('/api/workspaces/public/blobs/test')
    .set('Cookie', cookie);

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');
});

test('should be able to get private workspace with public pages', async t => {
  const { app, u1, storage } = t.context;

  // no authenticated user
  storage.get.resolves(blob());
  let res = await request(app.getHttpServer()).get(
    '/api/workspaces/private/blobs/test'
  );

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');

  // authenticated user
  const cookie = await internalSignIn(app, u1.id);
  res = await request(app.getHttpServer())
    .get('/api/workspaces/private/blobs/test')
    .set('cookie', cookie);

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');
});

test('should not be able to get private workspace with no public pages', async t => {
  const { app, u1 } = t.context;

  let res = await request(app.getHttpServer()).get(
    '/api/workspaces/totally-private/blobs/test'
  );

  t.is(res.status, HttpStatus.FORBIDDEN);

  res = await request(app.getHttpServer())
    .get('/api/workspaces/totally-private/blobs/test')
    .set('cookie', await internalSignIn(app, u1.id));

  t.is(res.status, HttpStatus.FORBIDDEN);
});

test('should be able to get permission granted workspace', async t => {
  const { app, u1, db, storage } = t.context;

  const cookie = await internalSignIn(app, u1.id);
  await db.workspaceUserPermission.create({
    data: {
      workspaceId: 'totally-private',
      userId: u1.id,
      type: 1,
      accepted: true,
    },
  });

  storage.get.resolves(blob());
  const res = await request(app.getHttpServer())
    .get('/api/workspaces/totally-private/blobs/test')
    .set('Cookie', cookie);

  t.is(res.status, HttpStatus.OK);
  t.is(res.text, 'blob');
});

test('should return 404 if blob not found', async t => {
  const { app, storage } = t.context;

  // @ts-expect-error mock
  storage.get.resolves({ body: null });
  const res = await request(app.getHttpServer()).get(
    '/api/workspaces/public/blobs/test'
  );

  t.is(res.status, HttpStatus.NOT_FOUND);
});

// doc
// NOTE: permission checking of doc api is the same with blob api, skip except one
test('should not be able to get private workspace with private page', async t => {
  const { app, u1 } = t.context;

  let res = await request(app.getHttpServer()).get(
    '/api/workspaces/private/docs/private-page'
  );

  t.is(res.status, HttpStatus.FORBIDDEN);

  res = await request(app.getHttpServer())
    .get('/api/workspaces/private/docs/private-page')
    .set('cookie', await internalSignIn(app, u1.id));

  t.is(res.status, HttpStatus.FORBIDDEN);
});

test('should be able to get doc', async t => {
  const { app, workspace: doc } = t.context;

  doc.getDoc.resolves({
    spaceId: '',
    docId: '',
    bin: Buffer.from([0, 0]),
    timestamp: Date.now(),
  });

  const res = await request(app.getHttpServer()).get(
    '/api/workspaces/private/docs/public'
  );

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'application/octet-stream');
  t.deepEqual(res.body, Buffer.from([0, 0]));
});

test('should be able to change page publish mode', async t => {
  const { app, workspace: doc, db } = t.context;

  doc.getDoc.resolves({
    spaceId: '',
    docId: '',
    bin: Buffer.from([0, 0]),
    timestamp: Date.now(),
  });

  let res = await request(app.getHttpServer()).get(
    '/api/workspaces/private/docs/public'
  );

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('publish-mode'), 'page');

  await db.workspacePage.update({
    where: { workspaceId_pageId: { workspaceId: 'private', pageId: 'public' } },
    data: { mode: 1 },
  });

  res = await request(app.getHttpServer()).get(
    '/api/workspaces/private/docs/public'
  );

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('publish-mode'), 'edgeless');
});
