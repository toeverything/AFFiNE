import { randomUUID } from 'node:crypto';

import ava, { TestFn } from 'ava';

import { Config } from '../../base/config';
import { HistoryModel, PublicDocMode } from '../../models';
import { DocModel } from '../../models/doc';
import { type User, UserModel } from '../../models/user';
import { type Workspace, WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';

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

test('should create a batch updates on a doc', async t => {
  const docId = randomUUID();
  const updates = await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob1'),
      timestamp: Date.now(),
      editorId: user.id,
    },
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob2'),
      timestamp: Date.now() + 1000,
    },
  ]);
  t.is(updates.count, 2);
});

test('should create error when createdAt timestamp is not unique', async t => {
  const docId = randomUUID();
  const timestamp = Date.now();
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob1'),
      timestamp,
      editorId: user.id,
    },
  ]);
  await t.throwsAsync(
    t.context.doc.createUpdates([
      {
        spaceId: workspace.id,
        docId,
        blob: Buffer.from('blob2'),
        timestamp,
        editorId: user.id,
      },
    ]),
    {
      message:
        /Unique constraint failed on the fields: \(`workspace_id`,`guid`,`created_at`\)/,
    }
  );
});

test('should find updates by spaceId and docId', async t => {
  const docId = randomUUID();
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Uint8Array.from([1, 2, 3]),
      timestamp: Date.now(),
      editorId: user.id,
    },
    {
      spaceId: workspace.id,
      docId,
      blob: Uint8Array.from([4, 5, 6]),
      timestamp: Date.now() + 1000,
      editorId: user.id,
    },
  ]);
  const foundUpdates = await t.context.doc.findUpdates(workspace.id, docId);
  t.is(foundUpdates.length, 2);
  t.deepEqual(foundUpdates[0].blob, Uint8Array.from([1, 2, 3]));
  t.deepEqual(foundUpdates[1].blob, Uint8Array.from([4, 5, 6]));

  let count = await t.context.doc.getUpdateCount(workspace.id, docId);
  t.is(count, 2);
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob3'),
      timestamp: Date.now(),
      editorId: user.id,
    },
  ]);
  count = await t.context.doc.getUpdateCount(workspace.id, docId);
  t.is(count, 3);
});

test('should delete updates by spaceId, docId, and createdAts', async t => {
  const docId = randomUUID();
  const timestamps = [Date.now(), Date.now() + 1000];
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob1'),
      timestamp: timestamps[0],
      editorId: user.id,
    },
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob2'),
      timestamp: timestamps[1],
    },
  ]);
  let count = await t.context.doc.deleteUpdates(
    workspace.id,
    docId,
    timestamps
  );
  t.is(count, 2);
  count = await t.context.doc.getUpdateCount(workspace.id, docId);
  t.is(count, 0);

  // delete non-existing updates
  count = await t.context.doc.deleteUpdates(workspace.id, docId, timestamps);
  t.is(count, 0);
});

test('should get global update count', async t => {
  const docId = randomUUID();
  const docId2 = randomUUID();
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob1'),
      timestamp: Date.now(),
      editorId: user.id,
    },
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob2'),
      timestamp: Date.now() + 1000,
      editorId: user.id,
    },
    {
      spaceId: workspace.id,
      docId: docId2,
      blob: Buffer.from('blob2'),
      timestamp: Date.now() + 1000,
      editorId: user.id,
    },
  ]);
  const count = await t.context.doc.getGlobalUpdateCount();
  t.is(count, 3);
});

test('should upsert a doc', async t => {
  const snapshot = {
    spaceId: workspace.id,
    docId: randomUUID(),
    blob: Uint8Array.from([1, 2, 3]),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  const foundSnapshot = await t.context.doc.get(
    snapshot.spaceId,
    snapshot.docId
  );
  t.truthy(foundSnapshot);
  t.deepEqual(foundSnapshot!.blob, snapshot.blob);
  t.is(foundSnapshot!.editorId, user.id);
  t.is(foundSnapshot!.timestamp, snapshot.timestamp);

  // update snapshot's editorId
  const otherUser = await t.context.user.create({
    email: 'test2@affine.pro',
  });
  const newSnapshot = {
    ...snapshot,
    editorId: otherUser.id,
  };
  await t.context.doc.upsert(newSnapshot);
  const updatedSnapshot = await t.context.doc.get(
    snapshot.spaceId,
    snapshot.docId
  );
  t.truthy(updatedSnapshot);
  t.deepEqual(updatedSnapshot!.blob, snapshot.blob);
  t.is(updatedSnapshot!.editorId, otherUser.id);
});

test('should get a doc authors', async t => {
  const snapshot = {
    spaceId: workspace.id,
    docId: randomUUID(),
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  const meta = await t.context.doc.getAuthors(snapshot.spaceId, snapshot.docId);
  t.truthy(meta);
  t.deepEqual(meta!.createdByUser, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  t.deepEqual(meta!.updatedByUser, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  t.truthy(meta!.createdAt);
  t.deepEqual(meta!.updatedAt, new Date(snapshot.timestamp));

  // update snapshot's editorId
  const otherUser = await t.context.user.create({
    email: 'test2@affine.pro',
  });
  const newSnapshot = {
    ...snapshot,
    editorId: otherUser.id,
    timestamp: Date.now(),
  };
  await t.context.doc.upsert(newSnapshot);
  const updatedSnapshotMeta = await t.context.doc.getAuthors(
    snapshot.spaceId,
    snapshot.docId
  );
  t.truthy(updatedSnapshotMeta);
  t.deepEqual(updatedSnapshotMeta!.createdByUser, {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  });
  t.deepEqual(updatedSnapshotMeta!.updatedByUser, {
    id: otherUser.id,
    name: otherUser.name,
    avatarUrl: otherUser.avatarUrl,
  });
  // createdAt should not change
  t.deepEqual(updatedSnapshotMeta!.createdAt, meta!.createdAt);
  t.deepEqual(updatedSnapshotMeta!.updatedAt, new Date(newSnapshot.timestamp));

  // get null when doc not found
  const notFoundMeta = await t.context.doc.getAuthors(
    snapshot.spaceId,
    randomUUID()
  );
  t.is(notFoundMeta, null);
});

test('should delete a doc, including histories, snapshots and updates', async t => {
  const docId = randomUUID();
  const snapshot = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  await t.context.history.create(snapshot, 1000);
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId,
      blob: Buffer.from('blob2'),
      timestamp: Date.now(),
      editorId: user.id,
    },
  ]);
  await t.context.doc.delete(workspace.id, docId);
  const foundSnapshot = await t.context.doc.get(workspace.id, docId);
  t.is(foundSnapshot, null);
  const foundHistory = await t.context.history.getLatest(workspace.id, docId);
  t.is(foundHistory, null);
  const foundUpdates = await t.context.doc.findUpdates(workspace.id, docId);
  t.is(foundUpdates.length, 0);
});

test('should delete all docs in a workspace', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const snapshot1 = {
    spaceId: workspace.id,
    docId: docId1,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  const snapshot2 = {
    spaceId: workspace.id,
    docId: docId2,
    blob: Buffer.from('blob2'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot1);
  await t.context.history.create(snapshot1, 1000);
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId: docId1,
      blob: Buffer.from('blob2'),
      timestamp: Date.now(),
      editorId: user.id,
    },
  ]);
  await t.context.doc.upsert(snapshot2);
  await t.context.history.create(snapshot2, 1000);
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId: docId2,
      blob: Buffer.from('blob2'),
      timestamp: Date.now(),
      editorId: user.id,
    },
  ]);
  const deletedCount = await t.context.doc.deleteAllByWorkspaceId(workspace.id);
  t.is(deletedCount, 2);
  const foundSnapshot1 = await t.context.doc.get(workspace.id, docId1);
  t.is(foundSnapshot1, null);
  const foundHistory1 = await t.context.history.getLatest(workspace.id, docId1);
  t.is(foundHistory1, null);
  const foundUpdates1 = await t.context.doc.findUpdates(workspace.id, docId1);
  t.is(foundUpdates1.length, 0);
  const foundSnapshot2 = await t.context.doc.get(workspace.id, docId2);
  t.is(foundSnapshot2, null);
  const foundHistory2 = await t.context.history.getLatest(workspace.id, docId2);
  t.is(foundHistory2, null);
  const foundUpdates2 = await t.context.doc.findUpdates(workspace.id, docId2);
  t.is(foundUpdates2.length, 0);
});

test('should find all docs timestamps in a workspace', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const timestamp1 = Date.now();
  const timestamp2 = Date.now() + 1000;
  const timestamp3 = Date.now() + 2000;
  const snapshot1 = {
    spaceId: workspace.id,
    docId: docId1,
    blob: Buffer.from('blob1'),
    timestamp: timestamp1,
    editorId: user.id,
  };
  const snapshot2 = {
    spaceId: workspace.id,
    docId: docId2,
    blob: Buffer.from('blob2'),
    timestamp: timestamp2,
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot1);
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId: docId1,
      blob: Buffer.from('blob2'),
      timestamp: timestamp3,
      editorId: user.id,
    },
  ]);
  await t.context.doc.upsert(snapshot2);
  const timestamps = await t.context.doc.findTimestampsByWorkspaceId(
    workspace.id
  );
  t.deepEqual(timestamps, {
    [docId1]: timestamp3,
    [docId2]: timestamp2,
  });
});

test('should detect doc exists or not', async t => {
  const docId = randomUUID();
  t.false(await t.context.doc.exists(workspace.id, docId));
  const snapshot = {
    spaceId: workspace.id,
    docId: docId,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  t.true(await t.context.doc.exists(workspace.id, docId));
});

test('should detect doc exists on only updates exists', async t => {
  const docId = randomUUID();
  await t.context.doc.createUpdates([
    {
      spaceId: workspace.id,
      docId: docId,
      blob: Buffer.from('blob2'),
      timestamp: Date.now(),
      editorId: user.id,
    },
  ]);
  t.true(await t.context.doc.exists(workspace.id, docId));
});

// #region DocMeta

test('should create doc meta with default mode and public false', async t => {
  const docId = randomUUID();
  const meta = await t.context.doc.upsertMeta(workspace.id, docId);
  t.is(meta.workspaceId, workspace.id);
  t.is(meta.docId, docId);
  t.is(meta.mode, PublicDocMode.Page);
  t.is(meta.public, false);
});

test('should update doc meta', async t => {
  const docId = randomUUID();
  const meta = await t.context.doc.upsertMeta(workspace.id, docId);
  const data = {
    mode: PublicDocMode.Edgeless,
    public: true,
  };
  await t.context.doc.upsertMeta(workspace.id, docId, data);
  const doc1 = await t.context.doc.getMeta(workspace.id, docId);
  t.deepEqual(doc1, {
    ...meta,
    ...data,
  });

  // set to private
  await t.context.doc.upsertMeta(workspace.id, docId, {
    public: false,
  });
  const doc2 = await t.context.doc.getMeta(workspace.id, docId);
  t.deepEqual(doc2, {
    ...meta,
    ...data,
    public: false,
  });
});

test('should get null when doc meta not exists', async t => {
  const doc = await t.context.doc.getMeta(workspace.id, randomUUID());
  t.is(doc, null);
});

test('should get doc meta with select', async t => {
  const docId = randomUUID();
  await t.context.doc.upsertMeta(workspace.id, docId);
  const doc = await t.context.doc.getMeta(workspace.id, docId, {
    select: {
      mode: true,
    },
  });
  t.is(doc!.mode, PublicDocMode.Page);
  // @ts-expect-error public is not in the select
  t.is(doc!.public, undefined);
});

test('should get public doc count', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  await t.context.doc.upsertMeta(workspace.id, docId1, {
    public: true,
  });
  await t.context.doc.upsertMeta(workspace.id, docId2, {
    public: true,
  });
  await t.context.doc.upsertMeta(workspace.id, docId3);
  const count = await t.context.doc.getPublicsCount(workspace.id);
  t.is(count, 2);
});

test('should get public docs of a workspace', async t => {
  const docId1 = `1-${randomUUID()}`;
  const docId2 = `2-${randomUUID()}`;
  const docId3 = `3-${randomUUID()}`;
  await t.context.doc.upsertMeta(workspace.id, docId1, {
    public: true,
  });
  await t.context.doc.upsertMeta(workspace.id, docId2, {
    public: true,
  });
  await t.context.doc.upsertMeta(workspace.id, docId3, {
    public: false,
  });
  const docs = await t.context.doc.findPublics(workspace.id);
  t.is(docs.length, 2);
  t.deepEqual(docs.map(d => d.docId).sort(), [docId1, docId2]);
});

test('should update title and summary', async t => {
  const docId = randomUUID();
  const snapshot = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot);
  const content = {
    title: 'test title',
    summary: 'test summary',
  };
  await t.context.doc.upsertMeta(workspace.id, docId, content);
  const foundContent = await t.context.doc.getMeta(workspace.id, docId, {
    select: {
      title: true,
      summary: true,
    },
  });
  t.deepEqual(foundContent, content);
  const updatedContent = {
    title: 'test title 2',
    summary: 'test summary 2',
  };
  await t.context.doc.upsertMeta(workspace.id, docId, updatedContent);
  const foundUpdatedContent = await t.context.doc.getMeta(workspace.id, docId, {
    select: {
      title: true,
      summary: true,
    },
  });
  t.deepEqual(foundUpdatedContent, updatedContent);
});

test('should find metas by workspaceIds and docIds', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  const snapshot1 = {
    spaceId: workspace.id,
    docId: docId1,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  const snapshot2 = {
    spaceId: workspace.id,
    docId: docId2,
    blob: Buffer.from('blob2'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  const snapshot3 = {
    spaceId: workspace.id,
    docId: docId3,
    blob: Buffer.from('blob3'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  await t.context.doc.upsert(snapshot1);
  await t.context.doc.upsert(snapshot2);
  await t.context.doc.upsert(snapshot3);
  const content1 = {
    title: 'test title',
    summary: 'test summary',
  };
  const content2 = {
    title: 'test title 2',
    summary: 'test summary 2',
  };
  await t.context.doc.upsertMeta(workspace.id, docId1, content1);
  await t.context.doc.upsertMeta(workspace.id, docId2, content2);
  let contents = await t.context.doc.findMetas([
    { workspaceId: workspace.id, docId: docId1 },
    { workspaceId: workspace.id, docId: randomUUID() },
    { workspaceId: randomUUID(), docId: docId1 },
    { workspaceId: workspace.id, docId: docId2 },
    { workspaceId: randomUUID(), docId: randomUUID() },
  ]);
  t.deepEqual(
    contents.map(c =>
      c
        ? {
            title: c.title,
            summary: c.summary,
          }
        : null
    ),
    [content1, null, null, content2, null]
  );
  contents = await t.context.doc.findMetas([
    { workspaceId: workspace.id, docId: docId1 },
    { workspaceId: workspace.id, docId: docId2 },
  ]);
  t.deepEqual(
    contents.map(c =>
      c
        ? {
            title: c.title,
            summary: c.summary,
          }
        : null
    ),
    [content1, content2]
  );
  // docId3 don't have meta
  contents = await t.context.doc.findMetas([
    { workspaceId: workspace.id, docId: docId1 },
    { workspaceId: workspace.id, docId: docId2 },
    { workspaceId: workspace.id, docId: docId3 },
  ]);
  t.deepEqual(
    contents.map(c =>
      c
        ? {
            title: c.title,
            summary: c.summary,
          }
        : null
    ),
    [content1, content2, null]
  );
});

test('should get doc info', async t => {
  const docId = randomUUID();
  const snapshot = {
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };

  await t.context.doc.upsert(snapshot);
  await t.context.doc.upsertMeta(workspace.id, docId, {
    title: 'test title',
    summary: 'test summary',
  });

  const docInfo = await t.context.doc.getDocInfo(workspace.id, docId);

  t.like(docInfo, {
    workspaceId: workspace.id,
    docId,
    updatedAt: new Date(snapshot.timestamp),
    creatorId: user.id,
    lastUpdaterId: user.id,
    title: 'test title',
    summary: 'test summary',
  });
});

test('should paginate docs info', async t => {
  const docId1 = randomUUID();
  const docId2 = randomUUID();
  const docId3 = randomUUID();
  const snapshot1 = {
    spaceId: workspace.id,
    docId: docId1,
    blob: Buffer.from('blob1'),
    timestamp: Date.now(),
    editorId: user.id,
  };
  const snapshot2 = {
    spaceId: workspace.id,
    docId: docId2,
    blob: Buffer.from('blob2'),
    timestamp: Date.now() + 1,
    editorId: user.id,
  };
  const snapshot3 = {
    spaceId: workspace.id,
    docId: docId3,
    blob: Buffer.from('blob3'),
    timestamp: Date.now() + 2,
    editorId: user.id,
  };
  await t.context.doc.upsertMeta(workspace.id, docId1);
  await t.context.doc.upsertMeta(workspace.id, docId2);
  await t.context.doc.upsertMeta(workspace.id, docId3);
  await t.context.doc.upsert(snapshot1);
  await t.context.doc.upsert(snapshot2);
  await t.context.doc.upsert(snapshot3);

  let [count, docs] = await t.context.doc.paginateDocInfo(workspace.id, {
    first: 1,
    offset: 0,
  });

  t.is(count, 3);
  t.is(docs.length, 1);
  t.is(docs[0].docId, docId1);

  [count, docs] = await t.context.doc.paginateDocInfo(workspace.id, {
    first: 1,
    offset: 0,
    after: docs[0].createdAt.toISOString(),
  });

  t.is(count, 3);
  t.is(docs.length, 1);
  t.is(docs[0].docId, docId2);
});
// #endregion
