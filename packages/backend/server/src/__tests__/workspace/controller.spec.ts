import { PassThrough } from 'node:stream';

import { HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import supertest from 'supertest';
import { applyUpdate, Doc as YDoc, Map as YMap } from 'yjs';

import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { PgWorkspaceDocStorageAdapter } from '../../core/doc';
import { WorkspacesController } from '../../core/workspaces/controller';
import { Models, PublicDocMode } from '../../models';
import {
  addDocToRootDoc,
  mergeUpdatesInApplyWay,
  readAllDocIdsFromRootDoc,
} from '../../native';
import { createTestingApp, TestingApp, TestUser } from '../utils';

const test = ava as TestFn<{
  db: PrismaClient;
  app: TestingApp;
  u1: TestUser;
  workspace: Sinon.SinonStubbedInstance<PgWorkspaceDocStorageAdapter>;
  models: Models;
}>;

test.before(async t => {
  const app = await createTestingApp({
    tapModule: m => {
      m.overrideProvider(PgWorkspaceDocStorageAdapter).useValue(
        Sinon.createStubInstance(PgWorkspaceDocStorageAdapter)
      );
    },
  });

  const db = app.get(PrismaClient);

  t.context.db = db;
  t.context.app = app;
  t.context.workspace = app.get(PgWorkspaceDocStorageAdapter);
  t.context.models = app.get(Models);
});

test.beforeEach(async t => {
  const { app, db } = t.context;
  await app.initTestingDB();
  t.context.u1 = await app.signupV1('u1@affine.pro');

  await db.workspaceDoc.create({
    data: {
      workspace: {
        create: {
          id: 'public',
          accessPolicy: { create: { visibility: 'public' } },
        },
      },
      docId: 'private',
    },
  });

  await db.workspaceDoc.create({
    data: {
      workspace: {
        create: {
          id: 'private',
          accessPolicy: { create: {} },
        },
      },
      docId: 'public',
      publishedAt: new Date(),
    },
  });

  await db.workspaceDoc.create({
    data: {
      workspace: {
        create: {
          id: 'totally-private',
          accessPolicy: { create: {} },
        },
      },
      docId: 'private',
    },
  });
  await db.docAccessPolicy.createMany({
    data: [
      { workspaceId: 'public', docId: 'private', visibility: 'private' },
      {
        workspaceId: 'private',
        docId: 'public',
        visibility: 'public',
        publicRole: 'external',
        publishedAt: new Date(),
      },
      {
        workspaceId: 'totally-private',
        docId: 'private',
        visibility: 'private',
      },
    ],
  });
});

test.after.always(async t => {
  await t.context.app.close();
});

// blob
test('source-less blob protocol is disabled for every client version', async t => {
  const { app } = t.context;
  const versions = [undefined, '0.26.0', '0.27.0-canary.1', '0.27.0'];
  const results = [];
  for (const version of versions) {
    const request = app.GET('/api/workspaces/public/blobs/test');
    if (version) request.set('x-affine-version', version);
    const response = await request;
    results.push({
      version: version ?? null,
      status: response.status,
      name: response.body.name,
      data: response.body.data,
    });
  }
  t.snapshot(results);
});

test('source-scoped blob controller maps manifests and closes streams', async t => {
  const actor = {
    ...t.context.u1,
    id: 'actor',
    hasPassword: true,
    emailVerified: true,
  };
  const getDocBlobManifestV1 = Sinon.stub().callsFake(
    async (_actorUserId: string | undefined, source: unknown) => ({
      source,
      keys: ['blob-key'],
    })
  );
  const getReadableWorkspaceBlobManifestV1 = Sinon.stub().callsFake(
    async (input: unknown) => ({ input, entries: [] })
  );
  const openBlobV1 = Sinon.stub().resolves({
    streamId: 'stream-1',
    mime: 'text/plain',
    size: 6,
    lastModifiedMs: Date.UTC(2026, 7, 30),
  });
  const readBlobStreamChunkV1 = Sinon.stub();
  readBlobStreamChunkV1.onFirstCall().resolves({
    body: Buffer.from('first'),
    done: false,
  });
  readBlobStreamChunkV1.onSecondCall().resolves({
    body: Buffer.alloc(0),
    done: false,
  });
  readBlobStreamChunkV1.onThirdCall().resolves({
    body: Buffer.from('!'),
    done: true,
  });
  const closeBlobStreamV1 = Sinon.stub().resolves();
  const controller = new WorkspacesController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getDocBlobManifestV1,
      getReadableWorkspaceBlobManifestV1,
      openBlobV1,
      readBlobStreamChunkV1,
      closeBlobStreamV1,
    } as unknown as BackendRuntimeProvider
  );
  const manifestHeaders: Record<string, string> = {};
  const json = Sinon.stub().callsFake(value => value);
  const manifestResponse = {
    setHeader: (name: string, value: string) => {
      manifestHeaders[name.toLowerCase()] = value;
    },
    json,
  } as never;

  await controller.blobManifestV1(
    undefined,
    'workspace',
    'currentDoc',
    'space:doc',
    undefined,
    manifestResponse
  );
  await controller.blobManifestV1(
    actor,
    'workspace',
    'history',
    'doc',
    '42',
    manifestResponse
  );
  for (const [rawLimit, expectedLimit] of [
    [undefined, undefined],
    ['25', 25],
    ['1.5', undefined],
  ] as const) {
    await controller.readableBlobManifestV1(
      actor,
      'workspace',
      'cursor',
      rawLimit,
      manifestResponse
    );
    t.is(
      getReadableWorkspaceBlobManifestV1.lastCall.args[0].limit,
      expectedLimit
    );
  }
  await t.throwsAsync(
    controller.blobManifestV1(
      undefined,
      'workspace',
      'history',
      'doc',
      'not-a-timestamp',
      manifestResponse
    )
  );

  const body: Buffer[] = [];
  const streamHeaders: Record<string, string> = {};
  const response = Object.assign(new PassThrough(), {
    setHeader(name: string, value: string | number) {
      streamHeaders[name.toLowerCase()] = String(value);
      return this;
    },
    getHeader(name: string) {
      return streamHeaders[name.toLowerCase()];
    },
  });
  response.on('data', chunk => body.push(Buffer.from(chunk)));
  await controller.blobV1(
    undefined,
    'workspace',
    'blob-key',
    'currentDoc',
    'space:doc',
    undefined,
    response as never
  );

  t.snapshot({
    manifestCalls: getDocBlobManifestV1.args,
    readableCalls: getReadableWorkspaceBlobManifestV1.args,
    manifestHeaders,
    stream: {
      open: openBlobV1.firstCall.args,
      reads: readBlobStreamChunkV1.args,
      close: closeBlobStreamV1.args,
      headers: streamHeaders,
      body: Buffer.concat(body).toString(),
    },
  });
});

test('source-scoped blob controller closes a failed stream', async t => {
  const actor = {
    ...t.context.u1,
    id: 'actor',
    hasPassword: true,
    emailVerified: true,
  };
  const closeBlobStreamV1 = Sinon.stub().resolves();
  const controller = new WorkspacesController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      openBlobV1: Sinon.stub().resolves({
        streamId: 'failed-stream',
        mime: 'application/octet-stream',
        size: 1,
        lastModifiedMs: 0,
      }),
      readBlobStreamChunkV1: Sinon.stub().rejects(new Error('read failed')),
      closeBlobStreamV1,
    } as unknown as BackendRuntimeProvider
  );
  const response = Object.assign(new PassThrough(), {
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
  });

  await t.throwsAsync(
    controller.blobV1(
      actor,
      'workspace',
      'blob-key',
      'history',
      'doc',
      '42',
      response as never
    ),
    { message: 'read failed' }
  );
  t.true(closeBlobStreamV1.calledOnceWithExactly('failed-stream'));
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

test('should not expose legacy root doc for private workspace with public pages', async t => {
  const { app } = t.context;

  const res = await app.GET('/api/workspaces/private/docs/private');

  t.is(res.status, HttpStatus.FORBIDDEN);
});

test('should expose filtered public root doc for shared page', async t => {
  const { app, workspace: doc } = t.context;

  let root = addDocToRootDoc(Buffer.from([0, 0]), 'public', 'Public Doc');
  const privateUpdate = addDocToRootDoc(root, 'private-page', 'Private Doc');
  root = mergeUpdatesInApplyWay([root, privateUpdate]);

  doc.getDoc.resolves({
    spaceId: 'private',
    docId: 'private',
    bin: root,
    timestamp: Date.now(),
  });

  const res = await app.GET(
    '/api/workspaces/private/public-docs/public/root-doc'
  );

  t.is(res.status, HttpStatus.OK);
  const body = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  t.deepEqual(readAllDocIdsFromRootDoc(body, false), ['public']);

  const ydoc = new YDoc({ guid: 'private' });
  t.notThrows(() =>
    applyUpdate(
      ydoc,
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    )
  );
  const pages = (ydoc.getMap('meta') as YMap<unknown>).get('pages') as
    | { toArray: () => Array<{ get: (key: string) => unknown }> }
    | undefined;
  t.deepEqual(
    pages?.toArray().map(page => page.get('id')),
    ['public']
  );
});

test('should expose public doc publish mode through HEAD route', async t => {
  const { app } = t.context;

  const res = await supertest(app.getHttpServer()).head(
    '/api/workspaces/private/public-docs/public'
  );

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('publish-mode'), 'page');
});

test('should expose public doc binary through public route', async t => {
  const { app, workspace: doc } = t.context;

  doc.getDoc.resolves({
    spaceId: 'private',
    docId: 'public',
    bin: Buffer.from([1, 2, 3]),
    timestamp: Date.now(),
  });

  const res = await app.GET('/api/workspaces/private/public-docs/public');

  t.is(res.status, HttpStatus.OK);
  t.is(res.get('content-type'), 'application/octet-stream');
  t.is(res.get('publish-mode'), 'page');
  t.deepEqual(res.body, Buffer.from([1, 2, 3]));
});

test('should record doc view when reading doc', async t => {
  const { app, workspace: doc, models } = t.context;

  doc.getDoc.resolves({
    spaceId: '',
    docId: '',
    bin: Buffer.from([0, 0]),
    timestamp: Date.now(),
  });

  const record = Sinon.stub(
    models.workspaceAnalytics,
    'recordDocView'
  ).resolves();
  await app.login(t.context.u1);

  const res = await app.GET('/api/workspaces/private/docs/public');
  t.is(res.status, HttpStatus.OK);
  t.true(record.calledOnce);
  t.like(record.firstCall.args[0], {
    workspaceId: 'private',
    docId: 'public',
    userId: t.context.u1.id,
    isGuest: false,
  });

  record.restore();
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

test('history maps runtime decisions and streams an allowed result', async t => {
  const { app, workspace } = t.context;
  workspace.getDocHistory.resolves({
    spaceId: 'private',
    docId: 'public',
    bin: Buffer.from([4, 5, 6]),
    timestamp: Date.now(),
    editor: undefined,
  });
  const authorize = Sinon.stub(
    app.get(BackendRuntimeProvider),
    'authorizePermissionV1'
  );
  t.teardown(() => authorize.restore());
  await app.login(t.context.u1);
  const timestamp = '2026-08-30T00:00:00.000Z';
  const path = `/api/workspaces/private/docs/public/histories/${timestamp}`;
  const response = (workspaceAllowed: boolean, docAllowed: boolean) => ({
    version: 1 as const,
    workspace: {
      effectiveRole: 'member' as const,
      decisions: [{ action: 'Workspace.Sync', allowed: workspaceAllowed }],
    },
    docs: [
      {
        docId: 'public',
        effectiveRole: 'reader' as const,
        decisions: [
          { action: 'Doc.Read', allowed: docAllowed },
          { action: 'Doc.History.Read', allowed: docAllowed },
        ],
      },
    ],
  });
  for (const [label, permission] of [
    ['workspace denied', response(false, true)],
    ['document denied', response(true, false)],
  ] as const) {
    authorize.resolves(permission);
    const denied = await app.GET(path);
    t.is(denied.status, HttpStatus.FORBIDDEN, label);
  }

  authorize.resolves(response(true, true));
  const res = await app.GET(path);
  t.is(res.status, HttpStatus.OK);
  t.is(res.get('cache-control'), 'private, no-store');
  t.deepEqual(res.body, Buffer.from([4, 5, 6]));
  t.deepEqual(authorize.lastCall.args, [
    {
      version: 1,
      workspaceId: 'private',
      actorUserId: t.context.u1.id,
      workspaceActions: ['Workspace.Sync'],
      docs: [
        {
          docId: 'public',
          actions: ['Doc.Read', 'Doc.History.Read'],
        },
      ],
    },
  ]);
  t.true(
    workspace.getDocHistory.calledOnceWithExactly(
      'private',
      'public',
      Date.parse(timestamp)
    )
  );
});
