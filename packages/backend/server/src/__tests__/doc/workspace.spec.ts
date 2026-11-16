import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { EventBus } from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import {
  DocStorageModule,
  PgWorkspaceDocStorageAdapter as Adapter,
} from '../../core/doc';
import { DocWriter } from '../../core/doc/writer';
import { createTestingModule, type TestingModule } from '../utils';

let m: TestingModule;
let db: PrismaClient;
let adapter: Adapter;
let runtime: BackendRuntimeProvider;

test.before('init testing module', async () => {
  m = await createTestingModule({
    imports: [DocStorageModule],
  });
  db = m.get(PrismaClient);
  adapter = m.get(Adapter);
  runtime = m.get(BackendRuntimeProvider);
  // @ts-expect-error private method
  Sinon.stub(adapter, 'createDocHistory');
});

test.beforeEach(async () => {
  await m.initTestingDB();
});

test.after.always(async () => {
  await m?.close();
});

test('should not compact from a stale update view', async t => {
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await adapter.pushDocUpdatesTrusted('2', 'doc-2', updates);

  await adapter.getDoc('2', 'doc-2');
  await adapter.pushDocUpdatesTrusted('2', 'doc-2', updates);

  const records = await db.update.findMany({
    where: {
      workspaceId: '2',
      id: 'doc-2',
    },
  });

  await adapter.pushDocUpdatesTrusted('2', 'doc-2', updates.slice(0, 1));

  // @ts-expect-error private method
  const stub = Sinon.stub(adapter, 'getDocUpdates').resolves(
    records.map(record => ({
      bin: record.blob,
      timestamp: record.createdAt.getTime(),
    }))
  );

  await adapter.getDoc('2', 'doc-2');
  stub.restore();

  t.not(await db.update.count(), 0);
});

test('should emit creation only from the committed creation receipt', async t => {
  const stub = Sinon.stub(runtime, 'appendWorkspaceDocUpdatesV1');
  t.teardown(() => stub.restore());
  let creations = 0;
  t.teardown(
    m.get(EventBus).on('doc.created', () => {
      creations++;
    })
  );
  stub.onCall(0).rejects(new Error('storage unavailable'));
  stub.onCall(1).resolves({ timestamp: Date.now(), created: true });
  stub.onCall(2).resolves({ timestamp: Date.now(), created: false });
  const push = () =>
    adapter.pushDocUpdates(
      '1',
      'doc-1',
      [Buffer.from([0, 0])],
      'owner',
      undefined,
      'create_doc'
    );
  await t.throwsAsync(push);
  t.is(creations, 0);
  await push();
  await push();
  t.is(creations, 1);

  const trusted = Sinon.stub(adapter, 'pushDocUpdatesTrusted').resolves(42);
  const read = Sinon.stub(adapter, 'getDoc').resolves(null);
  t.teardown(() => {
    trusted.restore();
    read.restore();
  });
  const writer = new DocWriter(adapter, m.get(EventBus));
  stub.onCall(3).rejects(new Error('permission denied'));
  await t.throwsAsync(() => writer.createDoc('1', 'title', 'body', 'actor'), {
    message: 'permission denied',
  });
  t.is(trusted.callCount, 0);
  stub.onCall(4).resolves({ timestamp: 41, created: true });
  const created = await writer.createDoc('1', 'title', 'body', 'actor');
  t.is(trusted.callCount, 1);
  const [workspaceId, propertiesId, updates, editor] = trusted.firstCall.args;
  t.is(workspaceId, '1');
  t.is(propertiesId, 'db$1$docProperties');
  t.is(editor, 'actor');
  const properties = new YDoc();
  for (const update of updates) applyUpdate(properties, update);
  t.deepEqual(properties.getMap(created.docId).toJSON(), {
    id: created.docId,
    createdBy: 'actor',
    updatedBy: 'actor',
  });
  t.deepEqual([...properties.share.keys()], [created.docId]);
});

test('should propagate storage errors without internal retries', async t => {
  const stub = Sinon.stub(runtime, 'appendWorkspaceDocUpdatesTrustedV1');

  stub.rejects(new Error('storage unavailable'));

  await t.throwsAsync(
    () => adapter.pushDocUpdatesTrusted('1', 'doc-1', [Buffer.from([0, 0])]),
    { message: 'storage unavailable' }
  );
  t.is(stub.callCount, 1);

  stub.restore();
});

test('should be able to merge updates as snapshot', async t => {
  const doc = new YDoc();
  const text = doc.getText('content');
  text.insert(0, 'hello');
  const update = encodeStateAsUpdate(doc);

  await db.workspace.create({
    data: {
      id: '1',
      accessPolicy: { create: {} },
    },
  });

  await db.update.createMany({
    data: [
      {
        id: 'doc-1',
        workspaceId: '1',
        blob: Buffer.from(update),
        createdAt: new Date(Date.now() + 1),
        createdBy: null,
      },
    ],
  });

  t.deepEqual(
    Buffer.from((await adapter.getDoc('1', 'doc-1'))!.bin),
    Buffer.from(update)
  );

  let appendUpdate = Buffer.from([]);
  doc.on('update', update => {
    appendUpdate = Buffer.from(update);
  });
  text.insert(5, 'world');

  await db.update.create({
    data: {
      workspaceId: '1',
      id: 'doc-1',
      blob: appendUpdate,
      createdAt: new Date(),
      createdBy: null,
    },
  });

  {
    const { bin } = (await adapter.getDoc('1', 'doc-1'))!;
    const dbDoc = new YDoc();
    applyUpdate(dbDoc, bin);

    t.is(dbDoc.getText('content').toString(), 'helloworld');
    t.deepEqual(encodeStateAsUpdate(dbDoc), encodeStateAsUpdate(doc));
  }
});

test('should raw merge updates without replacing persisted fragments', async t => {
  const updates: Buffer[] = [];
  {
    const doc = new YDoc();
    doc.on('update', data => {
      updates.push(Buffer.from(data));
    });

    const text = doc.getText('content');
    text.insert(0, 'hello');
    text.insert(5, 'world');
    text.insert(5, ' ');
    text.insert(11, '!');
  }

  {
    await adapter.pushDocUpdatesTrusted('1', 'doc-1', updates.slice(0, 2));
    // merge
    const { bin } = (await adapter.getDoc('1', 'doc-1'))!;
    const doc = new YDoc();
    applyUpdate(doc, bin);

    t.is(doc.getText('content').toString(), 'helloworld');
  }

  {
    await adapter.pushDocUpdatesTrusted('1', 'doc-1', updates.slice(2));
    // merge
    const { bin } = (await adapter.getDoc('1', 'doc-1'))!;
    const doc = new YDoc();
    applyUpdate(doc, bin);

    t.is(doc.getText('content').toString(), 'hello world!');
  }

  t.is(await db.update.count(), updates.length);
});

test('should merge updates after a future-dated snapshot', async t => {
  const updates: Buffer[] = [];
  {
    const doc = new YDoc();
    doc.on('update', data => {
      updates.push(Buffer.from(data));
    });

    const text = doc.getText('content');
    text.insert(0, 'hello');
    text.insert(5, 'world');
    text.insert(5, ' ');
    text.insert(11, '!');
  }

  await adapter.pushDocUpdatesTrusted('2', 'doc-1', updates.slice(0, 2)); // 'helloworld'
  const current = (await adapter.getDoc('2', 'doc-1'))!;
  const future = new Date(Date.now() + 10000);
  await db.snapshot.create({
    data: {
      workspaceId: '2',
      id: 'doc-1',
      blob: Buffer.from(current.bin),
      size: current.bin.byteLength,
      updatedAt: future,
    },
  });

  {
    await adapter.pushDocUpdatesTrusted('2', 'doc-1', updates.slice(2)); // 'hello world!'
    const { bin } = (await adapter.getDoc('2', 'doc-1'))!;

    const doc = new YDoc();
    applyUpdate(doc, bin);
    t.is(doc.getText('content').toString(), 'hello world!');
  }

  {
    const doc = new YDoc();
    applyUpdate(doc, (await adapter.getDoc('2', 'doc-1'))!.bin);
    t.is(doc.getText('content').toString(), 'hello world!');

    t.is(await db.update.count(), updates.length);
    t.true((await adapter.getDoc('2', 'doc-1'))!.timestamp > future.getTime());
  }
});

test('should not recreate a doc deleted before its read acquires the database lock', async t => {
  const workspaceId = 'delete-before-compaction';
  const docId = 'doc';
  const doc = new YDoc();
  doc.getText('content').insert(0, 'hello');
  const blob = Buffer.from(encodeStateAsUpdate(doc));
  const timestamp = new Date();

  await db.snapshot.create({
    data: {
      workspaceId,
      id: docId,
      blob,
      size: blob.byteLength,
      updatedAt: timestamp,
    },
  });
  await db.update.create({
    data: {
      workspaceId,
      id: docId,
      blob,
      createdAt: new Date(timestamp.getTime() + 1),
    },
  });

  let releaseDelete!: () => void;
  const mayCommit = new Promise<void>(resolve => {
    releaseDelete = resolve;
  });
  let rowsDeleted!: () => void;
  const deleteHasLock = new Promise<void>(resolve => {
    rowsDeleted = resolve;
  });
  const deleting = db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-doc-update:${workspaceId}/${docId}`}, 0))`;
    await tx.snapshot.deleteMany({ where: { workspaceId, id: docId } });
    await tx.update.deleteMany({ where: { workspaceId, id: docId } });
    rowsDeleted();
    await mayCommit;
  });

  await deleteHasLock;
  const compacting = adapter.getDoc(workspaceId, docId);
  await new Promise(resolve => setTimeout(resolve, 20));
  releaseDelete();
  await deleting;

  t.is(await compacting, null);
  t.is(await db.snapshot.count({ where: { workspaceId, id: docId } }), 0);
  t.is(await db.update.count({ where: { workspaceId, id: docId } }), 0);
});
