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

  await adapter.pushDocUpdatesTrusted('2', '2', updates);

  await adapter.getDoc('2', '2');
  await adapter.pushDocUpdatesTrusted('2', '2', updates);

  const records = await db.update.findMany({
    where: {
      workspaceId: '2',
      id: '2',
    },
  });

  await adapter.pushDocUpdatesTrusted('2', '2', updates.slice(0, 1));

  // @ts-expect-error private method
  const stub = Sinon.stub(adapter, 'getDocUpdates').resolves(
    records.map(record => ({
      bin: record.blob,
      timestamp: record.createdAt.getTime(),
    }))
  );

  await adapter.getDoc('2', '2');
  stub.restore();

  t.not(await db.update.count(), 0);
});

test('should finish doc creation after retrying failed updates', async t => {
  const stub = Sinon.stub(runtime, 'appendWorkspaceDocUpdatesTrustedV1');
  t.teardown(() => stub.restore());
  let creationCompleted = false;
  t.teardown(
    m.get(EventBus).on('doc.created', async () => {
      await new Promise<void>(resolve => setImmediate(resolve));
      creationCompleted = true;
    })
  );

  stub.onCall(0).rejects(new Error());
  stub.onCall(1).resolves(Date.now());

  await t.notThrowsAsync(() =>
    adapter.pushDocUpdatesTrusted('1', '1', [Buffer.from([0, 0])])
  );
  t.is(stub.callCount, 2);
  t.true(creationCompleted);
});

test('should throw if meet max retry times', async t => {
  const stub = Sinon.stub(runtime, 'appendWorkspaceDocUpdatesTrustedV1');

  stub.rejects(new Error());

  await t.throwsAsync(
    () => adapter.pushDocUpdatesTrusted('1', '1', [Buffer.from([0, 0])]),
    { message: 'Failed to store doc updates.' }
  );
  t.is(stub.callCount, 4);

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
        id: '1',
        workspaceId: '1',
        blob: Buffer.from(update),
        createdAt: new Date(Date.now() + 1),
        createdBy: null,
      },
    ],
  });

  t.deepEqual(
    Buffer.from((await adapter.getDoc('1', '1'))!.bin),
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
      id: '1',
      blob: appendUpdate,
      createdAt: new Date(),
      createdBy: null,
    },
  });

  {
    const { bin } = (await adapter.getDoc('1', '1'))!;
    const dbDoc = new YDoc();
    applyUpdate(dbDoc, bin);

    t.is(dbDoc.getText('content').toString(), 'helloworld');
    t.deepEqual(encodeStateAsUpdate(dbDoc), encodeStateAsUpdate(doc));
  }
});

test('should be able to merge updates into snapshot', async t => {
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
    await adapter.pushDocUpdatesTrusted('1', '1', updates.slice(0, 2));
    // merge
    const { bin } = (await adapter.getDoc('1', '1'))!;
    const doc = new YDoc();
    applyUpdate(doc, bin);

    t.is(doc.getText('content').toString(), 'helloworld');
  }

  {
    await adapter.pushDocUpdatesTrusted('1', '1', updates.slice(2));
    // merge
    const { bin } = (await adapter.getDoc('1', '1'))!;
    const doc = new YDoc();
    applyUpdate(doc, bin);

    t.is(doc.getText('content').toString(), 'hello world!');
  }

  t.is(await db.update.count(), 0);
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

  await adapter.pushDocUpdatesTrusted('2', '1', updates.slice(0, 2)); // 'helloworld'
  // merge
  await adapter.getDoc('2', '1');
  // fake the snapshot is a lot newer
  await db.snapshot.update({
    where: {
      workspaceId_id: {
        workspaceId: '2',
        id: '1',
      },
    },
    data: {
      updatedAt: new Date(Date.now() + 10000),
    },
  });

  {
    await adapter.pushDocUpdatesTrusted('2', '1', updates.slice(2)); // 'hello world!'
    const { bin } = (await adapter.getDoc('2', '1'))!;

    const doc = new YDoc();
    applyUpdate(doc, bin);
    t.is(doc.getText('content').toString(), 'hello world!');
  }

  {
    const doc = new YDoc();
    applyUpdate(doc, (await adapter.getDoc('2', '1'))!.bin);
    t.is(doc.getText('content').toString(), 'hello world!');

    t.is(await db.update.count(), 0);
  }
});

test('should not recreate a doc deleted before compaction acquires its database lock', async t => {
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
