import type { Snapshot } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';

import { DocStorageModule, PgWorkspaceDocStorageAdapter } from '../../core/doc';
import { DocStorageOptions } from '../../core/doc/options';
import { DocRecord } from '../../core/doc/storage';
import { createTestingModule, type TestingModule } from '../utils';

let m: TestingModule;
let adapter: PgWorkspaceDocStorageAdapter;
let db: PrismaClient;

// cleanup database before each test
test.before(async () => {
  m = await createTestingModule({
    imports: [DocStorageModule],
  });

  adapter = m.get(PgWorkspaceDocStorageAdapter);
  db = m.get(PrismaClient);
});

test.beforeEach(async () => {
  await m.initTestingDB();
  const options = m.get(DocStorageOptions);
  Sinon.stub(options, 'historyMaxAge').resolves(1000);
});

test.afterEach(async () => {
  Sinon.restore();
});

test.after.always(async () => {
  await m.close();
});

const snapshot: Snapshot = {
  workspaceId: '1',
  id: 'doc1',
  blob: Uint8Array.from([1, 0]),
  state: Uint8Array.from([0]),
  size: BigInt(2),
  updatedAt: new Date(),
  createdAt: new Date(),
  createdBy: null,
  updatedBy: null,
};

function getSnapshot(timestamp: number = Date.now()): DocRecord {
  return {
    spaceId: snapshot.workspaceId,
    docId: snapshot.id,
    bin: snapshot.blob,
    timestamp,
  };
}

test('should create doc history if never created before', async t => {
  // @ts-expect-error private method
  Sinon.stub(adapter, 'lastDocHistory').resolves(null);

  const timestamp = Date.now();
  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(timestamp));

  const history = await db.snapshotHistory.findFirst({
    where: {
      workspaceId: '1',
      id: 'doc1',
    },
  });

  t.truthy(history);
  t.is(history?.timestamp.getTime(), timestamp);
});

test('should not create history if timestamp equals to last record', async t => {
  const timestamp = new Date();

  // @ts-expect-error private method
  Sinon.stub(adapter, 'lastDocHistory').resolves({ timestamp, state: null });

  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(timestamp));

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

  // @ts-expect-error private method
  Sinon.stub(adapter, 'lastDocHistory').resolves({
    timestamp: new Date(timestamp.getTime() - 1000),
    state: Buffer.from([0, 1]),
  });

  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(timestamp));

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

  // @ts-expect-error private method
  Sinon.stub(adapter, 'lastDocHistory').resolves({
    timestamp: new Date(timestamp.getTime() - 1000 * 60 * 20),
    state: Buffer.from([0, 1]),
  });

  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(timestamp));

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

  // @ts-expect-error private method
  Sinon.stub(adapter, 'lastDocHistory').resolves({
    timestamp: new Date(timestamp.getTime() - 1),
    state: Buffer.from([0, 1]),
  });

  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(timestamp), true);

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

  const list = await adapter.listDocHistories(
    snapshot.workspaceId,
    snapshot.id,
    { before: timestamp + 20, limit: 8 }
  );
  const count = await db.snapshotHistory.count();

  t.is(list.length, 8);
  t.is(count, 20);
});

test('should be able to get history data', async t => {
  const timestamp = Date.now();

  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(timestamp), true);

  const history = await adapter.getDocHistory(
    snapshot.workspaceId,
    snapshot.id,
    timestamp
  );

  t.truthy(history);
  t.deepEqual(history?.bin, snapshot.blob);
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

  // @ts-expect-error private method
  const history = await adapter.lastDocHistory(
    snapshot.workspaceId,
    snapshot.id
  );

  t.truthy(history);
  t.is(history?.timestamp, timestamp + 9);
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

  // @ts-expect-error private method
  await adapter.createDocHistory(getSnapshot(history1Timestamp));

  await adapter.rollbackDoc(
    snapshot.workspaceId,
    snapshot.id,
    history1Timestamp
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
  t.deepEqual(history2.blob, Uint8Array.from([1, 1]));
});
