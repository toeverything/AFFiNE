import { mock } from 'node:test';

import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';
import {
  applyUpdate,
  decodeStateVector,
  Doc as YDoc,
  encodeStateAsUpdate,
} from 'yjs';

import { DocManager, DocModule } from '../src/core/doc';
import { QuotaModule } from '../src/core/quota';
import { StorageModule } from '../src/core/storage';
import { Config } from '../src/fundamentals/config';
import { createTestingModule, initTestingDB } from './utils';

const createModule = () => {
  return createTestingModule({
    imports: [QuotaModule, StorageModule, DocModule],
  });
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
  await initTestingDB(m.get(PrismaClient));
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
    (await manager.getBinary(ws.id, '1'))?.toString('hex'),
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
    (await manager.getBinary(ws.id, '1'))?.toString('hex'),
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

test('should not update snapshot if state is outdated', async t => {
  const db = m.get(PrismaClient);
  const manager = m.get(DocManager);

  await db.snapshot.create({
    data: {
      id: '2',
      workspaceId: '2',
      blob: Buffer.from([0, 0]),
      seq: 1,
    },
  });
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

  const updateWith3Records = await manager.getUpdates('2', '2');
  text.insert(11, '!');
  await manager.push('2', '2', updates[3]);
  const updateWith4Records = await manager.getUpdates('2', '2');

  // Simulation:
  //   Node A get 3 updates and squash them at time 1, will finish at time 10
  //   Node B get 4 updates and squash them at time 3, will finish at time 8
  //   Node B finish the squash first, and update the snapshot
  //   Node A finish the squash later, and update the snapshot to an outdated state
  // Time: ---------------------->
  //    A:   ^get           ^upsert
  //    B:      ^get    ^upsert
  //
  // We should avoid such situation
  // @ts-expect-error private
  await manager.squash(updateWith4Records, null);
  // @ts-expect-error private
  await manager.squash(updateWith3Records, null);

  const result = await db.snapshot.findUnique({
    where: {
      id_workspaceId: {
        id: '2',
        workspaceId: '2',
      },
    },
  });

  if (!result) {
    t.fail('snapshot not found');
    return;
  }

  const state = decodeStateVector(result.state!);
  t.is(state.get(doc.clientID), 12);

  const d = new YDoc();
  applyUpdate(d, result.blob!);

  const dtext = d.getText('content');
  t.is(dtext.toString(), 'hello world!');
});
