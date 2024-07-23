import { mock } from 'node:test';

import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { DocManager, DocModule } from '../src/core/doc';
import { QuotaModule } from '../src/core/quota';
import { StorageModule } from '../src/core/storage';
import { Config } from '../src/fundamentals/config';
import { createTestingModule } from './utils';

const createModule = () => {
  return createTestingModule(
    {
      imports: [QuotaModule, StorageModule, DocModule],
    },
    false
  );
};

let m: TestingModule;
let timer: Sinon.SinonFakeTimers;

// cleanup database before each test
test.beforeEach(async () => {
  timer = Sinon.useFakeTimers({
    toFake: ['setInterval'],
  });
  m = await createModule();
  await m.init();
});

test.afterEach.always(async () => {
  await m.close();
  timer.restore();
});

test('should setup update poll interval', async t => {
  const m = await createModule();
  const manager = m.get(DocManager);
  const fake = mock.method(manager, 'setup');

  await m.init();

  t.is(fake.mock.callCount(), 1);
  // @ts-expect-error private member
  t.truthy(manager.job);
  m.close();
});

test('should be able to stop poll', async t => {
  const manager = m.get(DocManager);
  const fake = mock.method(manager, 'destroy');

  await m.close();

  t.is(fake.mock.callCount(), 1);
  // @ts-expect-error private member
  t.is(manager.job, null);
});

test('should poll when intervel due', async t => {
  const manager = m.get(DocManager);
  const interval = m.get(Config).doc.manager.updatePollInterval;

  let resolve: any;
  // @ts-expect-error private method
  const fake = mock.method(manager, 'autoSquash', () => {
    return new Promise(_resolve => {
      resolve = _resolve;
    });
  });

  timer.tick(interval);
  t.is(fake.mock.callCount(), 1);

  // busy
  timer.tick(interval);
  // @ts-expect-error private member
  t.is(manager.busy, true);
  t.is(fake.mock.callCount(), 1);

  resolve();
  await timer.tickAsync(1);

  // @ts-expect-error private member
  t.is(manager.busy, false);
  timer.tick(interval);
  t.is(fake.mock.callCount(), 2);
});

test('should merge update when intervel due', async t => {
  const db = m.get(PrismaClient);
  const manager = m.get(DocManager);

  const doc = new YDoc();
  const text = doc.getText('content');
  text.insert(0, 'hello');
  const update = encodeStateAsUpdate(doc);

  const ws = await db.workspace.create({
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
        blob: Buffer.from([0, 0]),
        seq: 1,
      },
      {
        id: '1',
        workspaceId: '1',
        blob: Buffer.from(update),
        seq: 2,
      },
    ],
  });

  // @ts-expect-error private method
  await manager.autoSquash();

  t.deepEqual(
    (await manager.getBinary(ws.id, '1'))?.binary.toString('hex'),
    Buffer.from(update.buffer).toString('hex')
  );

  let appendUpdate = Buffer.from([]);
  doc.on('update', update => {
    appendUpdate = Buffer.from(update);
  });
  text.insert(5, 'world');

  await db.update.create({
    data: {
      workspaceId: ws.id,
      id: '1',
      blob: appendUpdate,
      seq: 3,
    },
  });

  // @ts-expect-error private method
  await manager.autoSquash();

  t.deepEqual(
    (await manager.getBinary(ws.id, '1'))?.binary.toString('hex'),
    Buffer.from(encodeStateAsUpdate(doc)).toString('hex')
  );
});

test('should have sequential update number', async t => {
  const db = m.get(PrismaClient);
  const manager = m.get(DocManager);
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await Promise.all(updates.map(update => manager.push('2', '2', update)));

  // [1,2,3]
  let records = await manager.getUpdates('2', '2');

  t.deepEqual(
    records.map(({ seq }) => seq),
    [1, 2, 3]
  );

  // @ts-expect-error private method
  await manager.autoSquash();

  await db.snapshot.update({
    where: {
      id_workspaceId: {
        id: '2',
        workspaceId: '2',
      },
    },
    data: {
      seq: 0x3ffffffe,
    },
  });

  await Promise.all(updates.map(update => manager.push('2', '2', update)));

  records = await manager.getUpdates('2', '2');

  // push a new update with new seq num
  await manager.push('2', '2', updates[0]);

  // let the manager ignore update with the new seq num
  const stub = Sinon.stub(manager, 'getUpdates').resolves(records);

  // @ts-expect-error private method
  await manager.autoSquash();
  stub.restore();

  records = await manager.getUpdates('2', '2');

  // should not merge in one run
  t.not(records.length, 0);
});

test('should have correct sequential update number with batching push', async t => {
  const manager = m.get(DocManager);
  const doc = new YDoc();
  const text = doc.getText('content');
  const updates: Buffer[] = [];

  doc.on('update', update => {
    updates.push(Buffer.from(update));
  });

  text.insert(0, 'hello');
  text.insert(5, 'world');
  text.insert(5, ' ');

  await manager.batchPush('2', '2', updates);

  // [1,2,3]
  const records = await manager.getUpdates('2', '2');

  t.deepEqual(
    records.map(({ seq }) => seq),
    [1, 2, 3]
  );
});

test('should retry if seq num conflict', async t => {
  const manager = m.get(DocManager);

  // @ts-expect-error private method
  const stub = Sinon.stub(manager, 'getUpdateSeq');

  stub.onCall(0).resolves(1);
  // seq num conflict
  stub.onCall(1).resolves(1);
  stub.onCall(2).resolves(2);
  await t.notThrowsAsync(() => manager.push('1', '1', Buffer.from([0, 0])));
  await t.notThrowsAsync(() => manager.push('1', '1', Buffer.from([0, 0])));

  t.is(stub.callCount, 3);
});

test('should throw if meet max retry times', async t => {
  const manager = m.get(DocManager);

  // @ts-expect-error private method
  const stub = Sinon.stub(manager, 'getUpdateSeq');

  stub.resolves(1);
  await t.notThrowsAsync(() => manager.push('1', '1', Buffer.from([0, 0])));

  await t.throwsAsync(
    () => manager.push('1', '1', Buffer.from([0, 0]), 3 /* retry 3 times */),
    { message: 'Failed to push update' }
  );
  t.is(stub.callCount, 5);
});

test('should be able to insert the snapshot if it is new created', async t => {
  const manager = m.get(DocManager);

  {
    const doc = new YDoc();
    const text = doc.getText('content');
    text.insert(0, 'hello');
    const update = encodeStateAsUpdate(doc);

    await manager.push('1', '1', Buffer.from(update));
  }
  const updates = await manager.getUpdates('1', '1');
  t.is(updates.length, 1);
  // @ts-expect-error private
  const { doc } = await manager.squash(null, updates);

  t.truthy(doc);
  t.is(doc.getText('content').toString(), 'hello');

  const restUpdates = await manager.getUpdates('1', '1');

  t.is(restUpdates.length, 0);
});

test('should be able to merge updates into snapshot', async t => {
  const manager = m.get(DocManager);

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
    await manager.batchPush('1', '1', updates.slice(0, 2));
    // do the merge
    const { doc } = (await manager.get('1', '1'))!;

    t.is(doc.getText('content').toString(), 'helloworld');
  }

  {
    await manager.batchPush('1', '1', updates.slice(2));
    const { doc } = (await manager.get('1', '1'))!;

    t.is(doc.getText('content').toString(), 'hello world!');
  }

  const restUpdates = await manager.getUpdates('1', '1');

  t.is(restUpdates.length, 0);
});

test('should not update snapshot if doc is outdated', async t => {
  const manager = m.get(DocManager);
  const db = m.get(PrismaClient);

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

  await manager.batchPush('2', '1', updates.slice(0, 2)); // 'helloworld'
  // merge updates into snapshot
  await manager.get('2', '1');
  // fake the snapshot is a lot newer
  await db.snapshot.update({
    where: {
      id_workspaceId: {
        workspaceId: '2',
        id: '1',
      },
    },
    data: {
      updatedAt: new Date(Date.now() + 10000),
    },
  });

  {
    const snapshot = await manager.getSnapshot('2', '1');
    await manager.batchPush('2', '1', updates.slice(2)); // 'hello world!'
    const updateRecords = await manager.getUpdates('2', '1');

    // @ts-expect-error private
    const { doc } = await manager.squash(snapshot, updateRecords);

    // all updated will merged into doc not matter it's timestamp is outdated or not,
    // but the snapshot record will not be updated
    t.is(doc.getText('content').toString(), 'hello world!');
  }

  {
    const doc = new YDoc();
    applyUpdate(doc, (await manager.getSnapshot('2', '1'))!.blob);
    // the snapshot will not get touched if the new doc's timestamp is outdated
    t.is(doc.getText('content').toString(), 'helloworld');

    // the updates are known as outdated, so they will be deleted
    t.is((await manager.getUpdates('2', '1')).length, 0);
  }
});
