import { randomUUID } from 'node:crypto';

import ava, { TestFn } from 'ava';

import { createTestingModule, type TestingModule } from '../../__tests__/utils';
import { Config } from '../../base';
import { DocModel } from '../doc';
import { HistoryModel } from '../history';
import { type User, UserModel } from '../user';
import { type Workspace, WorkspaceModel } from '../workspace';

interface Context {
  config: Config;
  module: TestingModule;
  user: UserModel;
  workspace: WorkspaceModel;
  doc: DocModel;
  history: HistoryModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();

  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.doc = module.get(DocModel);
  t.context.history = module.get(HistoryModel);
  t.context.config = module.get(Config);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.workspace.create(user.id);
});

test.after(async t => {
  await t.context.module.close();
});

test('should create a history record', async t => {
  const snapshot = {
    spaceId: workspace.id,
    docId: randomUUID(),
    blob: Uint8Array.from([1, 2, 3]),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  const created = await t.context.history.create(snapshot, 1000);
  t.truthy(created);
  t.deepEqual(created.timestamp, snapshot.timestamp);
  t.deepEqual(created.editor, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  const history = await t.context.history.get(
    snapshot.spaceId,
    snapshot.docId,
    snapshot.timestamp
  );
  t.deepEqual(history, {
    ...created,
    blob: snapshot.blob,
  });
});

test('should return null when history timestamp not match', async t => {
  const snapshot = {
    spaceId: workspace.id,
    docId: randomUUID(),
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  await t.context.history.create(snapshot, 1000);
  const history = await t.context.history.get(
    snapshot.spaceId,
    snapshot.docId,
    snapshot.timestamp + 1
  );
  t.is(history, null);
});

test('should find history records', async t => {
  const docId = randomUUID();
  const snapshot1 = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob1'),
    timestamp: Date.now() - 1000,
    editorId: user.id,
  };
  const snapshot2 = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob2'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.history.create(snapshot1, 1000);
  await t.context.history.create(snapshot2, 1000);
  let histories = await t.context.history.findMany(workspace.id, docId);
  t.is(histories.length, 2);
  t.deepEqual(histories[0].timestamp, snapshot2.timestamp);
  t.deepEqual(histories[0].editor, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  t.deepEqual(histories[1].timestamp, snapshot1.timestamp);
  t.deepEqual(histories[1].editor, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  // only take 1 history, order by timestamp desc
  histories = await t.context.history.findMany(workspace.id, docId, {
    take: 1,
  });
  t.is(histories.length, 1);
  t.deepEqual(histories[0].timestamp, snapshot2.timestamp);
  t.deepEqual(histories[0].editor, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  // get empty history
  histories = await t.context.history.findMany(workspace.id, docId, {
    before: Date.now() - 1000000,
  });
  t.is(histories.length, 0);
});

test('should get latest history', async t => {
  const docId = randomUUID();
  const snapshot1 = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob1'),
    timestamp: Date.now() - 1000,
    editorId: user.id,
  };
  const snapshot2 = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob2'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.history.create(snapshot1, 1000);
  await t.context.history.create(snapshot2, 1000);
  const history = await t.context.history.getLatest(workspace.id, docId);
  t.truthy(history);
  t.deepEqual(history!.timestamp, snapshot2.timestamp);
  t.deepEqual(history!.editor, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  // return null when no history
  const emptyHistory = await t.context.history.getLatest(
    workspace.id,
    randomUUID()
  );
  t.is(emptyHistory, null);
});
