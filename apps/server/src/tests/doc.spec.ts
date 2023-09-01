import { deepEqual, equal, ok } from 'node:assert';
import { mock } from 'node:test';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import test from 'ava';
import { register } from 'prom-client';
import * as Sinon from 'sinon';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { Config, ConfigModule } from '../config';
import { MetricsModule } from '../metrics';
import { DocManager, DocModule } from '../modules/doc';
import { PrismaModule, PrismaService } from '../prisma';
import { flushDB } from './utils';

const createModule = () => {
  return Test.createTestingModule({
    imports: [
      PrismaModule,
      MetricsModule,
      ConfigModule.forRoot(),
      DocModule.forRoot(),
    ],
  }).compile();
};

let app: INestApplication;
let m: TestingModule;
let timer: Sinon.SinonFakeTimers;

// cleanup database before each test
test.beforeEach(async () => {
  timer = Sinon.useFakeTimers({
    toFake: ['setInterval'],
  });
  await flushDB();
  m = await createModule();
  app = m.createNestApplication();
  app.enableShutdownHooks();
  await app.init();
});

test.afterEach(async () => {
  await app.close();
  timer.restore();
});

test('should setup update poll interval', async t => {
  register.clear();
  const m = await createModule();
  const manager = m.get(DocManager);
  const fake = mock.method(manager, 'setup');

  await m.createNestApplication().init();

  equal(fake.mock.callCount(), 1);
  // @ts-expect-error private member
  ok(manager.job);
  t.pass();
});

test('should be able to stop poll', async t => {
  const manager = m.get(DocManager);
  const fake = mock.method(manager, 'destroy');

  await app.close();

  equal(fake.mock.callCount(), 1);
  // @ts-expect-error private member
  equal(manager.job, null);
  t.pass();
});

test('should poll when intervel due', async t => {
  const manager = m.get(DocManager);
  const interval = m.get(Config).doc.manager.updatePollInterval;

  let resolve: any;
  const fake = mock.method(manager, 'apply', () => {
    return new Promise(_resolve => {
      resolve = _resolve;
    });
  });

  timer.tick(interval);
  equal(fake.mock.callCount(), 1);

  // busy
  timer.tick(interval);
  // @ts-expect-error private member
  equal(manager.busy, true);
  equal(fake.mock.callCount(), 1);

  resolve();
  await timer.tickAsync(1);

  // @ts-expect-error private member
  equal(manager.busy, false);
  timer.tick(interval);
  equal(fake.mock.callCount(), 2);
  t.pass();
});

test('should merge update when intervel due', async t => {
  const db = m.get(PrismaService);
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
      },
      {
        id: '1',
        workspaceId: '1',
        blob: Buffer.from(update),
      },
    ],
  });

  await manager.apply();

  deepEqual(await manager.getLatestUpdate(ws.id, '1'), update);

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
    },
  });

  await manager.apply();

  deepEqual(
    await manager.getLatestUpdate(ws.id, '1'),
    encodeStateAsUpdate(doc)
  );
  t.pass();
});
