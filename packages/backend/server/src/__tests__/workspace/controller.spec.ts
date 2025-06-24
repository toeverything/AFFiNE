import { Readable } from 'node:stream';

import { HttpStatus } from '@nestjs/common';
import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { PgWorkspaceDocStorageAdapter } from '../../core/doc';
import { WorkspaceBlobStorage } from '../../core/storage';
import { Models, PublicDocMode, WorkspaceRole } from '../../models';
import { createTestingApp, TestingApp, TestUser } from '../utils';

const test = ava as TestFn<{
  db: PrismaClient;
  app: TestingApp;
  u1: TestUser;
  storage: Sinon.SinonStubbedInstance<WorkspaceBlobStorage>;
  workspace: Sinon.SinonStubbedInstance<PgWorkspaceDocStorageAdapter>;
  models: Models;
}>;

test.before(async t => {
  const app = await createTestingApp({
    tapModule: m => {
      m.overrideProvider(WorkspaceBlobStorage)
        .useValue(Sinon.createStubInstance(WorkspaceBlobStorage))
        .overrideProvider(PgWorkspaceDocStorageAdapter)
        .useValue(Sinon.createStubInstance(PgWorkspaceDocStorageAdapter));
    },
  });

  const db = app.get(PrismaClient);

  t.context.u1 = await app.signupV1('u1@affine.pro');
  t.context.db = db;
  t.context.app = app;
  t.context.storage = app.get(WorkspaceBlobStorage);
  t.context.workspace = app.get(PgWorkspaceDocStorageAdapter);
  t.context.models = app.get(Models);

  await db.workspaceDoc.create({
    data: {
      workspace: {
        create: {
          id: 'public',
          public: true,
        },
      },
      docId: 'private',
      public: false,
    },
  });

  await db.workspaceDoc.create({
    data: {
      workspace: {
        create: {
          id: 'private',
          public: false,
        },
      },
      docId: 'public',
      public: true,
    },
  });

  await db.workspaceDoc.create({
    data: {
      workspace: {
        create: {
          id: 'totally-private',
          public: false,
        },
      },
      docId: 'private',
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
  const { app, storage } = t.context;

  // no authenticated user
  storage.get.resolves(blob());
  let res = await app.GET('/api/workspaces/public/blobs/test');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');

  // authenticated user
  await app.login(t.context.u1);
  res = await app.GET('/api/workspaces/public/blobs/test');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');
});

test('should be able to get private workspace with public pages', async t => {
  const { app, storage } = t.context;

  // no authenticated user
  storage.get.resolves(blob());
  let res = await app.GET('/api/workspaces/private/blobs/test');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');

  // authenticated user
  await app.login(t.context.u1);
  res = await app.GET('/api/workspaces/private/blobs/test');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'text/plain');
  t.is(res.text, 'blob');
});

test('should not be able to get private workspace with no public pages', async t => {
  const { app } = t.context;

  let res = await app.GET('/api/workspaces/totally-private/blobs/test');

  t.is(res.status, HttpStatus.FORBIDDEN);

  res = await app.GET('/api/workspaces/totally-private/blobs/test');

  t.is(res.status, HttpStatus.FORBIDDEN);
});

test('should be able to get permission granted workspace', async t => {
  const { app, storage } = t.context;

  await t.context.models.workspaceUser.set(
    'totally-private',
    t.context.u1.id,
    WorkspaceRole.Collaborator,
    { status: WorkspaceMemberStatus.Accepted }
  );

  storage.get.resolves(blob());
  await app.login(t.context.u1);
  const res = await app.GET('/api/workspaces/totally-private/blobs/test');

  t.is(res.status, HttpStatus.OK);
  t.is(res.text, 'blob');
});

test('should return 404 if blob not found', async t => {
  const { app, storage } = t.context;

  // @ts-expect-error mock
  storage.get.resolves({ body: null });
  const res = await app.GET('/api/workspaces/public/blobs/test');

  t.is(res.status, HttpStatus.NOT_FOUND);
});

// doc
// NOTE: permission checking of doc api is the same with blob api, skip except one
test('should not be able to get private workspace with private page', async t => {
  const { app } = t.context;

  let res = await app.GET('/api/workspaces/private/docs/private-page');

  t.is(res.status, HttpStatus.FORBIDDEN);

  await app.login(t.context.u1);
  res = await app.GET('/api/workspaces/private/docs/private-page');

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

  const res = await app.GET('/api/workspaces/private/docs/public');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'application/octet-stream');
  t.deepEqual(res.body, Buffer.from([0, 0]));
});

test('should be able to change page publish mode', async t => {
  const { app, workspace: doc, models } = t.context;

  doc.getDoc.resolves({
    spaceId: '',
    docId: '',
    bin: Buffer.from([0, 0]),
    timestamp: Date.now(),
  });

  let res = await app.GET('/api/workspaces/private/docs/public');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('publish-mode'), 'page');

  await models.doc.upsertMeta('private', 'public', {
    mode: PublicDocMode.Edgeless,
  });

  res = await app.GET('/api/workspaces/private/docs/public');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('publish-mode'), 'edgeless');
});
