import { ScheduleModule } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { DocStorageModule } from '../../core/doc';
import { DocStorageCronJob } from '../../core/doc/job';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  cronJob: DocStorageCronJob;
}

const test = ava as TestFn<Context>;

// cleanup database before each test
test.before(async t => {
  t.context.module = await createTestingModule({
    imports: [ScheduleModule.forRoot(), DocStorageModule],
  });

  t.context.db = t.context.module.get(PrismaClient);
  t.context.cronJob = t.context.module.get(DocStorageCronJob);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('should be able to cleanup expired history', async t => {
  const { db } = t.context;
  const timestamp = Date.now();

  // insert expired data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: '1',
        id: '1',
        blob: Buffer.from([1, 1]),
        timestamp: new Date(timestamp - 10 - i),
        expiredAt: new Date(timestamp - 1),
      })),
  });

  // insert available data
  await db.snapshotHistory.createMany({
    data: Array.from({ length: 10 })
      .fill(0)
      .map((_, i) => ({
        workspaceId: '1',
        id: '1',
        blob: Buffer.from([1, 1]),
        timestamp: new Date(timestamp + i),
        expiredAt: new Date(timestamp + 1000),
      })),
  });

  let count = await db.snapshotHistory.count();
  t.is(count, 20);

  await t.context.cronJob.cleanExpiredHistories();

  count = await db.snapshotHistory.count();
  t.is(count, 10);

  const example = await db.snapshotHistory.findFirst();
  t.truthy(example);
  t.true(example!.expiredAt > new Date());
});
