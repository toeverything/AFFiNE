import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import {
  DocStorageModule,
  PgWorkspaceDocStorageAdapter as Adapter,
} from '../../core/doc';
import { createTestingModule, type TestingModule } from '../utils';

let m: TestingModule;
let db: PrismaClient;
let adapter: Adapter;

test.before('init testing module', async () => {
  m = await createTestingModule({
    imports: [DocStorageModule],
  });
  db = m.get(PrismaClient);
  adapter = m.get(Adapter);
  // @ts-expect-error private method
  Sinon.stub(adapter, 'createDocHistory');
});

test.beforeEach(async () => {
  await m.initTestingDB();
});

test.after.always(async () => {
  await m?.close();
});

test('should have timestamp update', async t => {
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await adapter.pushDocUpdates('2', '2', updates);

  let records = await db.update.findMany({
    where: {
      workspaceId: '2',
      id: '2',
    },
  });

  let firstTimestamp = records[0].createdAt.getTime();
  t.deepEqual(
    records.map(({ createdAt }) => createdAt.getTime()),
    [firstTimestamp, firstTimestamp + 1, firstTimestamp + 2]
  );

  // merge
  await adapter.getDoc('2', '2');

  // change timestamp again
  await adapter.pushDocUpdates('2', '2', updates);

  records = await db.update.findMany({
    where: {
      workspaceId: '2',
      id: '2',
    },
  });

  firstTimestamp = records[0].createdAt.getTime();
  t.deepEqual(
    records.map(({ createdAt }) => createdAt.getTime()),
    [firstTimestamp, firstTimestamp + 1, firstTimestamp + 2]
  );

  // push a new update
  await adapter.pushDocUpdates('2', '2', updates.slice(0, 1));

  // let the manager ignore update with the new seq num
  // @ts-expect-error private method
  const stub = Sinon.stub(adapter, 'getDocUpdates').resolves(
    records.map(record => ({
      bin: record.blob,
      timestamp: record.createdAt.getTime(),
    }))
  );

  await adapter.getDoc('2', '2');
  stub.restore();

  // should not merge in one run
  t.not(await db.update.count(), 0);
});

test('should retry if failed to insert updates', async t => {
  const stub = Sinon.stub();
  const createMany = db.update.createMany;
  db.update.createMany = stub;

  stub.onCall(0).rejects(new Error());
  stub.onCall(1).resolves();

  await t.notThrowsAsync(() =>
    adapter.pushDocUpdates('1', '1', [Buffer.from([0, 0])])
  );
  t.is(stub.callCount, 2);

  stub.reset();
  db.update.createMany = createMany;
});

test('should throw if meet max retry times', async t => {
  const stub = Sinon.stub();
  const createMany = db.update.createMany;
  db.update.createMany = stub;

  stub.rejects(new Error());

  await t.throwsAsync(
    () => adapter.pushDocUpdates('1', '1', [Buffer.from([0, 0])]),
    { message: 'Failed to store doc updates.' }
  );
  t.is(stub.callCount, 4);

  stub.reset();
  db.update.createMany = createMany;
});

test('should be able to merge updates as snapshot', async t => {
  const doc = new YDoc();
  const text = doc.getText('content');
  text.insert(0, 'hello');
  const update = encodeStateAsUpdate(doc);

  await db.workspace.create({
    data: {
      id: '1',
      public: false,
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
    await adapter.pushDocUpdates('1', '1', updates.slice(0, 2));
    // merge
    const { bin } = (await adapter.getDoc('1', '1'))!;
    const doc = new YDoc();
    applyUpdate(doc, bin);

    t.is(doc.getText('content').toString(), 'helloworld');
  }

  {
    await adapter.pushDocUpdates('1', '1', updates.slice(2));
    // merge
    const { bin } = (await adapter.getDoc('1', '1'))!;
    const doc = new YDoc();
    applyUpdate(doc, bin);

    t.is(doc.getText('content').toString(), 'hello world!');
  }

  t.is(await db.update.count(), 0);
});

test('should not update snapshot if doc is outdated', async t => {
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

  await adapter.pushDocUpdates('2', '1', updates.slice(0, 2)); // 'helloworld'
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
    await adapter.pushDocUpdates('2', '1', updates.slice(2)); // 'hello world!'
    const { bin } = (await adapter.getDoc('2', '1'))!;

    // all updated will merged into doc not matter it's timestamp is outdated or not,
    // but the snapshot record will not be updated
    const doc = new YDoc();
    applyUpdate(doc, bin);
    t.is(doc.getText('content').toString(), 'hello world!');
  }

  {
    const doc = new YDoc();
    applyUpdate(doc, (await adapter.getDoc('2', '1'))!.bin);
    // the snapshot will not get touched if the new doc's timestamp is outdated
    t.is(doc.getText('content').toString(), 'helloworld');

    // the updates are known as outdated, so they will be deleted
    t.is(await db.update.count(), 0);
  }
});
