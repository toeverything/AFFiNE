import { TestingModule } from '@nestjs/testing';
import type { Snapshot } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';

import { DocHistoryManager } from '../src/core/doc';
import { QuotaModule } from '../src/core/quota';
import { StorageModule } from '../src/core/storage';
import { type EventPayload } from '../src/fundamentals/event';
import { createTestingModule } from './utils';

let m: TestingModule;
let manager: DocHistoryManager;
let db: PrismaClient;

// cleanup database before each test
test.beforeEach(async () => {
  m = await createTestingModule({
    imports: [StorageModule, QuotaModule],
    providers: [DocHistoryManager],
  });

  manager = m.get(DocHistoryManager);
  Sinon.stub(manager, 'getExpiredDateFromNow').resolves(
    new Date(Date.now() + 1000)
  );
  db = m.get(PrismaClient);
});

test.afterEach.always(async () => {
  await m.close();
  Sinon.restore();
});

const snapshot: Snapshot = {
  workspaceId: '1',
  id: 'doc1',
  blob: Buffer.from([1, 0]),
  state: Buffer.from([0]),
  seq: 0,
  updatedAt: new Date(),
  createdAt: new Date(),
};

function getEventData(
  timestamp: Date = new Date()
): EventPayload<'snapshot.updated'> {
  return {
    workspaceId: snapshot.workspaceId,
    id: snapshot.id,
    previous: { ...snapshot, updatedAt: timestamp },
  };
}

test('should create doc history if never created before', async t => {
  Sinon.stub(manager, 'last').resolves(null);

  const timestamp = new Date();
  await manager.onDocUpdated(getEventData(timestamp));

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.truthy(history);
  t.is(history?.timestamp.getTime(), timestamp.getTime());
});

test('should not create history if timestamp equals to last record', async t => {
  const timestamp = new Date();
  Sinon.stub(manager, 'last').resolves({ timestamp, state: null });

  await manager.onDocUpdated(getEventData(timestamp));

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.falsy(history);
});

test('should not create history if state equals to last record', async t => {
  const timestamp = new Date();
  Sinon.stub(manager, 'last').resolves({
    timestamp: new Date(timestamp.getTime() - 1),
    state: snapshot.state,
  });

  await manager.onDocUpdated(getEventData(timestamp));

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.falsy(history);
});

test('should not create history if time diff is less than interval config', async t => {
  const timestamp = new Date();
  Sinon.stub(manager, 'last').resolves({
    timestamp: new Date(timestamp.getTime() - 1000),
    state: Buffer.from([0, 1]),
  });

  await manager.onDocUpdated(getEventData(timestamp));

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.falsy(history);
});

test('should create history if time diff is larger than interval config and state diff', async t => {
  const timestamp = new Date();
  Sinon.stub(manager, 'last').resolves({
    timestamp: new Date(timestamp.getTime() - 1000 * 60 * 20),
    state: Buffer.from([0, 1]),
  });

  await manager.onDocUpdated(getEventData(timestamp));

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.truthy(history);
});

test('should create history with force flag even if time diff in small', async t => {
  const timestamp = new Date();
  Sinon.stub(manager, 'last').resolves({
    timestamp: new Date(timestamp.getTime() - 1),
    state: Buffer.from([0, 1]),
  });

  await manager.onDocUpdated(getEventData(timestamp), true);

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.truthy(history);
});

test('should correctly list all history records', async t => {
  const timestamp = Date.now();

  // insert expired data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: snapshot.workspaceId,
        id: snapshot.id,
        blob: snapshot.blob,
        state: snapshot.state,
        timestamp: new Date(timestamp - 10 - i),
        expiredAt: new Date(timestamp - 1),
      })),
  });

  // insert available data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: snapshot.workspaceId,
        id: snapshot.id,
        blob: snapshot.blob,
        state: snapshot.state,
        timestamp: new Date(timestamp + i),
        expiredAt: new Date(timestamp + 1000),
      })),
  });

  const list = await manager.list(
    snapshot.workspaceId,
    snapshot.id,
    new Date(timestamp + 20),
    8
  );
  const count = await manager.count(snapshot.workspaceId, snapshot.id);

  t.is(list.length, 8);
  t.is(count, 10);
});

test('should be able to get history data', async t => {
  const timestamp = new Date();

  await manager.onDocUpdated(getEventData(timestamp), true);

  const history = await manager.get(
    snapshot.workspaceId,
    snapshot.id,
    timestamp
  );

  t.truthy(history);
  t.deepEqual(history?.blob, snapshot.blob);
});

test('should be able to get last history record', async t => {
  const timestamp = Date.now();

  // insert available data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: snapshot.workspaceId,
        id: snapshot.id,
        blob: snapshot.blob,
        state: snapshot.state,
        timestamp: new Date(timestamp + i),
        expiredAt: new Date(timestamp + 1000),
      })),
  });

  const history = await manager.last(snapshot.workspaceId, snapshot.id);

  t.truthy(history);
  t.is(history?.timestamp.getTime(), timestamp + 9);
});

test('should be able to recover from history', async t => {
  await db.snapshot.create({
    data: {
      ...snapshot,
      blob: Buffer.from([1, 1]),
      state: Buffer.from([1, 1]),
    },
  });
  const history1Timestamp = snapshot.updatedAt.getTime() - 10;
  await manager.onDocUpdated(getEventData(new Date(history1Timestamp)));

  await manager.recover(
    snapshot.workspaceId,
    snapshot.id,
    new Date(history1Timestamp)
  );

  const [history1, history2] = await db.snapshotHistory.findMany({
    where: {
      workspaceId: snapshot.workspaceId,
      id: snapshot.id,
    },
  });

  t.is(history1.timestamp.getTime(), history1Timestamp);
  t.is(history2.timestamp.getTime(), snapshot.updatedAt.getTime());

  // new history data force created with snapshot state before recovered
  t.deepEqual(history2.blob, Buffer.from([1, 1]));
  t.deepEqual(history2.state, Buffer.from([1, 1]));
});

test('should be able to cleanup expired history', async t => {
  const timestamp = Date.now();

  // insert expired data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: snapshot.workspaceId,
        id: snapshot.id,
        blob: snapshot.blob,
        state: snapshot.state,
        timestamp: new Date(timestamp - 10 - i),
        expiredAt: new Date(timestamp - 1),
      })),
  });

  // insert available data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: snapshot.workspaceId,
        id: snapshot.id,
        blob: snapshot.blob,
        state: snapshot.state,
        timestamp: new Date(timestamp + i),
        expiredAt: new Date(timestamp + 1000),
      })),
  });

  let count = await db.snapshotHistory.count();
  t.is(count, 20);

  await manager.cleanupExpiredHistory();

  count = await db.snapshotHistory.count();
  t.is(count, 10);

  const example = await db.snapshotHistory.findFirst();
  t.truthy(example);
  t.true(example!.expiredAt > new Date());
});
