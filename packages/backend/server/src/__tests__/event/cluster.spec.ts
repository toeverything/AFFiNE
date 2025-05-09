import { INestApplication } from '@nestjs/common';
import ava, { TestFn } from 'ava';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import Sinon from 'sinon';

import { EventBus } from '../../base';
import { SocketIoAdapter } from '../../base/websocket';
import { createTestingModule } from '../utils';
import { Listeners } from './provider';

const test = ava as TestFn<{
  app1: INestApplication;
  app2: INestApplication;
}>;

async function createApp() {
  const m = await createTestingModule(
    {
      providers: [Listeners],
    },
    false
  );

  const app = m.createNestApplication({ logger: false });

  app.useWebSocketAdapter(new SocketIoAdapter(app));
  await app.init();

  return app;
}

test.before(async t => {
  t.context.app1 = await createApp();
  t.context.app2 = await createApp();
});

test.after(async t => {
  await t.context.app1.close();
  await t.context.app2.close();
});

test('should broadcast event to cluster instances', async t => {
  const { app1, app2 } = t.context;

  // app 1 for listening
  const eventbus1 = app1.get(EventBus);

  const listener = Sinon.spy(app1.get(Listeners), 'onTestEvent');
  const runtimeListener = Sinon.stub().returns({ count: 2 });
  const off = eventbus1.on('__test__.event', runtimeListener);

  // app 2 for broadcasting
  const eventbus2 = app2.get(EventBus);
  eventbus2.broadcast('__test__.event', { count: 0 });

  // cause the cross instances broadcasting is asynchronization calling
  // we should wait for the event's arriving before asserting
  await eventbus1.waitFor('__test__.event');

  t.true(listener.calledOnceWith({ count: 0 }));
  t.true(runtimeListener.calledOnceWith({ count: 0 }));

  off();
});

test('should continuously use the same request id', async t => {
  const { app1, app2 } = t.context;

  const eventbus1 = app1.get(EventBus);
  const eventbus2 = app2.get(EventBus);

  const listener = Sinon.spy(app1.get(Listeners), 'onRequestId');

  const cls = ClsServiceManager.getClsService();
  cls.run(() => {
    cls.set(CLS_ID, 'test-request-id');
    eventbus2.broadcast('__test__.requestId', {});
  });

  await eventbus1.waitFor('__test__.requestId');
  t.true(listener.lastCall.returned('test-request-id'));
});
