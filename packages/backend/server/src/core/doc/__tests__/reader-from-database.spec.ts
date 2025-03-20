import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import { User, Workspace } from '@prisma/client';
import ava, { TestFn } from 'ava';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { AppModule } from '../../../app.module';
import { ConfigModule } from '../../../base/config';
import { Models } from '../../../models';
import { WorkspaceBlobStorage } from '../../storage/wrappers/blob';
import { DocReader, PgWorkspaceDocStorageAdapter } from '..';
import { DatabaseDocReader } from '../reader';

const test = ava as TestFn<{
  models: Models;
  app: TestingApp;
  docReader: DocReader;
  adapter: PgWorkspaceDocStorageAdapter;
  blobStorage: WorkspaceBlobStorage;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [ConfigModule.forRoot(), AppModule],
  });

  t.context.models = app.get(Models);
  t.context.docReader = app.get(DocReader);
  t.context.adapter = app.get(PgWorkspaceDocStorageAdapter);
  t.context.blobStorage = app.get(WorkspaceBlobStorage);
  t.context.app = app;
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

test.afterEach.always(() => {
  mock.reset();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should return null when doc not found', async t => {
  const { docReader } = t.context;
  const docId = randomUUID();
  const doc = await docReader.getDoc(workspace.id, docId);
  t.is(doc, null);
});

test('should return doc when found', async t => {
  const { docReader } = t.context;
  t.true(docReader instanceof DatabaseDocReader);

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

test('should get doc content', async t => {
  const docId = randomUUID();
  const { docReader } = t.context;

  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await t.context.adapter.pushDocUpdates(workspace.id, docId, updates, user.id);

  const docContent = await docReader.getDocContent(workspace.id, docId);
  // TODO(@fengmk2): should create a test ydoc with blocks
  t.is(docContent, null);
});

test('should get workspace content with default avatar', async t => {
  const { docReader } = t.context;
  t.true(docReader instanceof DatabaseDocReader);

  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await t.context.adapter.pushDocUpdates(
    workspace.id,
    workspace.id,
    updates,
    user.id
  );

  mock.method(docReader, 'parseWorkspaceContent', () => ({
    name: 'Test Workspace',
    avatarKey: '',
  }));

  const workspaceContent = await docReader.getWorkspaceContent(workspace.id);
  t.truthy(workspaceContent);
  t.deepEqual(workspaceContent, {
    id: workspace.id,
    name: 'Test Workspace',
    avatarKey: '',
    avatarUrl: undefined,
  });
});

test('should get workspace content with custom avatar', async t => {
  const { docReader, blobStorage } = t.context;
  t.true(docReader instanceof DatabaseDocReader);

  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await t.context.adapter.pushDocUpdates(
    workspace.id,
    workspace.id,
    updates,
    user.id
  );

  const avatarKey = randomUUID();
  await blobStorage.put(
    workspace.id,
    avatarKey,
    Buffer.from('mock avatar image data here')
  );

  mock.method(docReader, 'parseWorkspaceContent', () => ({
    name: 'Test Workspace',
    avatarKey,
  }));

  const workspaceContent = await docReader.getWorkspaceContent(workspace.id);
  t.truthy(workspaceContent);
  t.deepEqual(workspaceContent, {
    id: workspace.id,
    name: 'Test Workspace',
    avatarKey,
    avatarUrl: `http://localhost:3010/api/workspaces/${workspace.id}/blobs/${avatarKey}`,
  });
  // should save to database
  const workspace2 = await t.context.models.workspace.get(workspace.id);
  t.truthy(workspace2);
  t.is(workspace2!.name, 'Test Workspace');
  t.is(workspace2!.avatarKey, avatarKey);

  // read from database
  await t.context.models.workspace.update(workspace.id, {
    name: 'Test Workspace 2',
  });
  const workspaceContent2 = await docReader.getWorkspaceContent(workspace.id);
  t.truthy(workspaceContent2);
  t.deepEqual(workspaceContent2, {
    id: workspace.id,
    name: 'Test Workspace 2',
    avatarKey,
    avatarUrl: `http://localhost:3010/api/workspaces/${workspace.id}/blobs/${avatarKey}`,
  });
});
