import { mock } from 'node:test';

import { ScheduleModule } from '@nestjs/schedule';
import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
import * as Sinon from 'sinon';

import { DocStorageModule } from '../../src/core/doc';
import { DocStorageCronJob } from '../../src/core/doc/job';
import { Config } from '../../src/fundamentals/config';
import { createTestingModule } from '../utils';

let m: TestingModule;
let timer: Sinon.SinonFakeTimers;
let db: PrismaClient;

// cleanup database before each test
test.before(async () => {
  timer = Sinon.useFakeTimers({
    toFake: ['setInterval'],
  });
  m = await createTestingModule({
    imports: [ScheduleModule.forRoot(), DocStorageModule],
  });

  db = m.get(PrismaClient);
});

test.after.always(async () => {
  await m.close();
  timer.restore();
});

test('should poll when intervel due', async t => {
  const manager = m.get(DocStorageCronJob);
  const interval = m.get(Config).doc.manager.updatePollInterval;

  let resolve: any;
  const fake = mock.method(manager, 'autoMergePendingDocUpdates', () => {
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

test('should be able to cleanup expired history', async t => {
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

  await m.get(DocStorageCronJob).cleanupExpiredHistory();

  count = await db.snapshotHistory.count();
  t.is(count, 10);

  const example = await db.snapshotHistory.findFirst();
  t.truthy(example);
  t.true(example!.expiredAt > new Date());
});
