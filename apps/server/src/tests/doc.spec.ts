import { deepEqual, equal, ok } from 'node:assert';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sinon from 'sinon';
import * as Y from 'yjs';

import { Config, ConfigModule } from '../config';
import { DocManager, DocModule } from '../modules/doc';
import { PrismaModule, PrismaService } from '../prisma';
import { flushDB } from './utils';

const createModule = () => {
  return Test.createTestingModule({
    imports: [PrismaModule, ConfigModule.forRoot(), DocModule.forRoot()],
  }).compile();
};

test('Doc Module', async t => {
  let app: INestApplication;
  let m: TestingModule;
  let timer: Sinon.SinonFakeTimers;

  // cleanup database before each test
  beforeEach(async () => {
    timer = Sinon.useFakeTimers({
      toFake: ['setInterval'],
    });
    await flushDB();
    m = await createModule();
    app = m.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    timer.restore();
  });

  await t.test('should setup update poll interval', async () => {
    const m = await createModule();
    const manager = m.get(DocManager);
    const fake = mock.method(manager, 'setup');

    await m.createNestApplication().init();

    equal(fake.mock.callCount(), 1);
    // @ts-expect-error private member
    ok(manager.job);
  });

  await t.test('should be able to stop poll', async () => {
    const manager = m.get(DocManager);
    const fake = mock.method(manager, 'destroy');

    await app.close();

    equal(fake.mock.callCount(), 1);
    // @ts-expect-error private member
    equal(manager.job, null);
  });

  await t.test('should poll when intervel due', async () => {
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
  });

  await t.test('should merge update when intervel due', async () => {
    const db = m.get(PrismaService);
    const manager = m.get(DocManager);

    const doc = new Y.Doc();
    const text = doc.getText('content');
    text.insert(0, 'hello');
    const update = Y.encodeStateAsUpdate(doc);

    const ws = await db.workspace.create({
      data: {
        public: false,
        updates: {
          createMany: {
            data: [
              {
                id: '1',
                blob: Buffer.from([0, 0]),
              },
              {
                id: '1',
                blob: Buffer.from(update),
              },
            ],
          },
        },
      },
    });

    await manager.apply();

    deepEqual(await manager.getLatest(ws.id, '1'), update);

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
      await manager.getLatest(ws.id, '1'),
      Y.mergeUpdates([update, appendUpdate])
    );
  });
});
