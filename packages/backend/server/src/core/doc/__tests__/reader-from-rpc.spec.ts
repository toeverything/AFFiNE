import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import { User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { UserFriendlyError } from '../../../base';
import { ConfigFactory } from '../../../base/config';
import { Models } from '../../../models';
import {
  DatabaseDocReader,
  DocReader,
  DocStorageModule,
  PgWorkspaceDocStorageAdapter,
} from '..';
import { RpcDocReader } from '../reader';

const module = await createModule({
  imports: [DocStorageModule],
});

const test = ava as TestFn<{
  models: Models;
  app: TestingApp;
  docApp: TestingApp;
  docReader: DocReader;
  databaseDocReader: DatabaseDocReader;
  adapter: PgWorkspaceDocStorageAdapter;
  config: ConfigFactory;
}>;

test.before(async t => {
  // test key
  process.env.AFFINE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgS3IAkshQuSmFWGpe
rGTg2vwaC3LdcvBQlYHHMBYJZMyhRANCAAQXdT/TAh4neNEpd4UqpDIEqWv0XvFo
BRJxGsC5I/fetqObdx1+KEjcm8zFU2xLaUTw9IZCu8OslloOjQv4ur0a
-----END PRIVATE KEY-----`;
  // @ts-expect-error testing
  env.FLAVOR = 'renderer';
  const notDocApp = await createTestingApp();
  // @ts-expect-error testing
  env.FLAVOR = 'doc';
  const docApp = await createTestingApp();

  t.context.models = notDocApp.get(Models);
  t.context.docReader = notDocApp.get(DocReader);
  t.context.databaseDocReader = docApp.get(DatabaseDocReader);
  t.context.adapter = docApp.get(PgWorkspaceDocStorageAdapter);
  t.context.config = notDocApp.get(ConfigFactory);
  t.context.app = notDocApp;
  t.context.docApp = docApp;
});

let user: User;
let workspace: Workspace;

test.beforeEach(async t => {
  t.context.config.override({
    docService: {
      endpoint: t.context.docApp.url(),
    },
  });
  await t.context.app.initTestingDB();
  user = await t.context.models.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.models.workspace.create(user.id);
});

test.afterEach.always(() => {
  mock.reset();
});

test.after.always(async t => {
  await t.context.app.close();
  await t.context.docApp.close();
  await module.close();
});

test('should be rpc reader', async t => {
  const { docReader } = t.context;
  t.true(docReader instanceof RpcDocReader);
});

test('should return null when doc not found', async t => {
  const { docReader } = t.context;
  const docId = randomUUID();
  const doc = await docReader.getDoc(workspace.id, docId);
  t.is(doc, null);
});

test('should throw error when doc service internal error', async t => {
  const { docReader, adapter } = t.context;
  const docId = randomUUID();
  mock.method(adapter, 'getDoc', async () => {
    throw new Error('mock doc service internal error');
  });
  mock.method(adapter, 'getDocBinNative', async () => {
    throw new Error('mock doc service internal error');
  });
  let err = await t.throwsAsync(docReader.getDoc(workspace.id, docId), {
    instanceOf: UserFriendlyError,
    message: 'An internal error occurred.',
    name: 'internal_server_error',
  });
  t.is(err.type, 'internal_server_error');
  t.is(err.status, 500);

  err = await t.throwsAsync(docReader.getDocDiff(workspace.id, docId), {
    instanceOf: UserFriendlyError,
    message: 'An internal error occurred.',
    name: 'internal_server_error',
  });
  t.is(err.type, 'internal_server_error');
  t.is(err.status, 500);

  err = await t.throwsAsync(docReader.getDocContent(workspace.id, docId), {
    instanceOf: UserFriendlyError,
    message: 'An internal error occurred.',
    name: 'internal_server_error',
  });
  t.is(err.type, 'internal_server_error');
  t.is(err.status, 500);

  err = await t.throwsAsync(docReader.getWorkspaceContent(workspace.id), {
    instanceOf: UserFriendlyError,
    message: 'An internal error occurred.',
    name: 'internal_server_error',
  });
  t.is(err.type, 'internal_server_error');
  t.is(err.status, 500);
});

test('should fallback to database doc reader when endpoint network error', async t => {
  const { docReader } = t.context;
  t.context.config.override({
    docService: {
      endpoint: 'http://localhost:13010',
    },
  });
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

  const doc = await docReader.getDoc(workspace.id, docId);
  t.truthy(doc);
  t.is(Buffer.from(doc!.bin).toString('utf8'), 'blob1 data');
  t.is(doc!.timestamp, timestamp);
  t.is(doc!.editor, user.id);
});

test('should return doc when found', async t => {
  const { docReader } = t.context;

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

  const doc = await docReader.getDoc(workspace.id, docId);
  t.truthy(doc);
  t.is(doc!.bin.toString(), 'blob1 data');
  t.is(doc!.timestamp, timestamp);
  t.is(doc!.editor, user.id);
});

test('should return doc diff', async t => {
  const { docReader } = t.context;
  const docId = randomUUID();
  const timestamp = Date.now();
  let updates: Buffer[] = [];
  const doc1 = new YDoc();
  doc1.on('update', data => {
    updates.push(Buffer.from(data));
  });

  const text = doc1.getText('content');
  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');
  text.insert(11, '!');

  await t.context.models.doc.createUpdates(
    updates.map((update, index) => ({
      spaceId: workspace.id,
      docId,
      blob: update,
      timestamp: timestamp + index,
      editorId: user.id,
    }))
  );
  // clear updates
  updates.splice(0, updates.length);

  const doc2 = new YDoc();
  const diff = await docReader.getDocDiff(workspace.id, docId);
  t.truthy(diff);
  t.truthy(diff!.missing);
  t.truthy(diff!.state);
  applyUpdate(doc2, diff!.missing);
  t.is(doc2.getText('content').toString(), 'hello world!');

  // nothing changed
  const diff2 = await docReader.getDocDiff(workspace.id, docId, diff!.state);
  t.truthy(diff2);
  t.truthy(diff2!.missing);
  t.deepEqual(diff2!.missing, new Uint8Array([0, 0]));
  t.truthy(diff2!.state);
  applyUpdate(doc2, diff2!.missing);
  t.is(doc2.getText('content').toString(), 'hello world!');

  // add new content on doc1
  text.insert(12, '@');
  await t.context.models.doc.createUpdates(
    updates.map((update, index) => ({
      spaceId: workspace.id,
      docId,
      blob: update,
      timestamp: Date.now() + index + 1000,
      editorId: user.id,
    }))
  );

  const diff3 = await docReader.getDocDiff(workspace.id, docId, diff2!.state);
  t.truthy(diff3);
  t.truthy(diff3!.missing);
  t.truthy(diff3!.state);
  applyUpdate(doc2, diff3!.missing);
  t.is(doc2.getText('content').toString(), 'hello world!@');
});

test('should get doc diff fallback to database doc reader when endpoint network error', async t => {
  const { docReader } = t.context;
  t.context.config.override({
    docService: {
      endpoint: 'http://localhost:13010',
    },
  });
  const docId = randomUUID();
  const timestamp = Date.now();
  let updates: Buffer[] = [];
  const doc1 = new YDoc();
  doc1.on('update', data => {
    updates.push(Buffer.from(data));
  });

  const text = doc1.getText('content');
  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');
  text.insert(11, '!');

  await t.context.models.doc.createUpdates(
    updates.map((update, index) => ({
      spaceId: workspace.id,
      docId,
      blob: update,
      timestamp: timestamp + index,
      editorId: user.id,
    }))
  );
  // clear updates
  updates.splice(0, updates.length);

  const doc2 = new YDoc();
  const diff = await docReader.getDocDiff(workspace.id, docId);
  t.truthy(diff);
  t.truthy(diff!.missing);
  t.truthy(diff!.state);
  applyUpdate(doc2, diff!.missing);
  t.is(doc2.getText('content').toString(), 'hello world!');
});

test('should get doc content', async t => {
  const docId = randomUUID();
  const { docReader, databaseDocReader } = t.context;
  mock.method(databaseDocReader, 'getDocContent', async () => {
    return {
      title: 'test title',
      summary: 'test summary',
    };
  });
  const docContent = await docReader.getDocContent(workspace.id, docId);
  t.deepEqual(docContent, {
    title: 'test title',
    summary: 'test summary',
  });
});

test('should return null when doc content not exists', async t => {
  const docId = randomUUID();
  const { docReader, adapter } = t.context;

  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await adapter.pushDocUpdates(workspace.id, docId, updates, user.id);

  const docContent = await docReader.getDocContent(workspace.id, docId);
  t.is(docContent, null);

  const notExists = await docReader.getDocContent(workspace.id, randomUUID());
  t.is(notExists, null);
});

test('should get workspace content from doc service rpc', async t => {
  const { docReader, databaseDocReader } = t.context;
  const track = mock.method(
    databaseDocReader,
    'getWorkspaceContent',
    async () => {
      return {
        id: workspace.id,
        name: 'test name',
        avatarKey: '',
      };
    }
  );

  const workspaceContent = await docReader.getWorkspaceContent(workspace.id);
  t.is(track.mock.callCount(), 1);
  t.deepEqual(workspaceContent, {
    id: workspace.id,
    name: 'test name',
    avatarKey: '',
  });
});

test('should return null when workspace bin meta not exists', async t => {
  const { docReader, adapter } = t.context;
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await adapter.pushDocUpdates(workspace.id, workspace.id, updates, user.id);

  const workspaceContent = await docReader.getWorkspaceContent(workspace.id);
  t.is(workspaceContent, null);

  // workspace not exists
  const notExists = await docReader.getWorkspaceContent(randomUUID());
  t.is(notExists, null);
});

test('should return doc markdown success', async t => {
  const { docReader } = t.context;

  const workspace = await module.create(Mockers.Workspace, {
    owner: user,
    name: '',
  });

  const docSnapshot = await module.create(Mockers.DocSnapshot, {
    workspaceId: workspace.id,
    user,
  });

  const result = await docReader.getDocMarkdown(
    workspace.id,
    docSnapshot.id,
    false
  );
  t.snapshot(result);
});

test('should read markdown return null when doc not exists', async t => {
  const { docReader } = t.context;

  const workspace = await module.create(Mockers.Workspace, {
    owner: user,
    name: '',
  });

  const result = await docReader.getDocMarkdown(
    workspace.id,
    randomUUID(),
    false
  );
  t.is(result, null);
});
