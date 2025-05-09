import { TestingModule } from '@nestjs/testing';
import ava, { TestFn } from 'ava';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';
import Sinon from 'sinon';

import { EventBus, metrics } from '../../base';
import { createTestingModule, sleep } from '../utils';
import { Listeners } from './provider';

export const test = ava as TestFn<{
  module: TestingModule;
  eventbus: EventBus;
  listeners: Sinon.SinonSpiedInstance<Listeners>;
}>;

test.before(async t => {
  const m = await createTestingModule({
    providers: [Listeners],
  });
  const eventbus = m.get(EventBus);
  t.context.module = m;
  t.context.eventbus = eventbus;
});

test.beforeEach(t => {
  Sinon.restore();
  const { module } = t.context;
  t.context.listeners = Sinon.spy(module.get(Listeners));
});

test.after(async t => {
  await t.context.module.close();
});

test('should dispatch event listener', t => {
  const { eventbus, listeners } = t.context;

  const runtimeListener = Sinon.stub();
  const off = eventbus.on('__test__.event', runtimeListener);

  const payload = { count: 0 };
  eventbus.emit('__test__.event', payload);

  t.true(listeners.onTestEvent.calledOnceWithExactly(payload));
  t.true(runtimeListener.calledOnceWithExactly(payload));

  off();
});

test('should dispatch async event listener', async t => {
  const { eventbus, listeners } = t.context;

  const runtimeListener = Sinon.stub().returnsArg(0);
  const off = eventbus.on('__test__.event', runtimeListener);

  const payload = { count: 0 };
  const returns = await eventbus.emitAsync('__test__.event', payload);

  t.true(listeners.onTestEvent.calledOnceWithExactly(payload));
  t.true(listeners.onTestEventAndEvent2.calledOnceWithExactly(payload));
  t.true(runtimeListener.calledOnceWithExactly(payload));

  t.deepEqual(returns, [payload, payload, payload]);

  off();
});

test('should dispatch multiple event handlers with same name', async t => {
  const { eventbus, listeners } = t.context;

  const payload = { count: 0 };
  await eventbus.emitAsync('__test__.event', payload);

  t.true(listeners.onTestEvent.calledOnceWithExactly(payload));
  t.true(listeners.onTestEventAndEvent2.calledOnceWithExactly(payload));
});

test('should dispatch event listener with multiple event names', async t => {
  const { eventbus, listeners } = t.context;

  const payload = { count: 0 };
  await eventbus.emitAsync('__test__.event', payload);

  t.like(listeners.onTestEventAndEvent2.lastCall.args[0], payload);

  await eventbus.emitAsync('__test__.event2', payload);

  t.like(listeners.onTestEventAndEvent2.lastCall.args[0], payload);
});

test('should record event handler call metrics', async t => {
  const { eventbus } = t.context;
  const timerStub = Sinon.stub(
    metrics.event.histogram('function_timer'),
    'record'
  );
  const counterStub = Sinon.stub(
    metrics.event.counter('function_calls'),
    'add'
  );

  await eventbus.emitAsync('__test__.event', { count: 0 });

  t.true(timerStub.calledTwice);
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'event_handler',
    event: '__test__.event',
    namespace: '__test__',
    handler: 'Listeners.onTestEvent',
    error: false,
  });
  t.deepEqual(timerStub.lastCall.args[1], {
    name: 'event_handler',
    event: '__test__.event',
    namespace: '__test__',
    handler: 'Listeners.onTestEventAndEvent2',
    error: false,
  });

  t.true(counterStub.calledTwice);
  t.deepEqual(counterStub.firstCall.args[1], {
    name: 'event_handler',
    event: '__test__.event',
    namespace: '__test__',
    handler: 'Listeners.onTestEvent',
    error: false,
  });
  t.deepEqual(counterStub.lastCall.args[1], {
    name: 'event_handler',
    event: '__test__.event',
    namespace: '__test__',
    handler: 'Listeners.onTestEventAndEvent2',
    error: false,
  });

  timerStub.reset();
  counterStub.reset();
  await eventbus.emitAsync('__test__.event2', { count: 0 });

  t.true(timerStub.calledOnce);
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'event_handler',
    event: '__test__.event2',
    namespace: '__test__',
    handler: 'Listeners.onTestEventAndEvent2',
    error: false,
  });

  t.true(counterStub.calledOnce);
  t.deepEqual(counterStub.firstCall.args[1], {
    name: 'event_handler',
    event: '__test__.event2',
    namespace: '__test__',
    handler: 'Listeners.onTestEventAndEvent2',
    error: false,
  });

  timerStub.reset();
  counterStub.reset();
  try {
    await eventbus.emitAsync('__test__.throw', { count: 0 });
  } catch {
    // noop
  }

  t.true(timerStub.calledOnce);
  t.deepEqual(timerStub.firstCall.args[1], {
    name: 'event_handler',
    event: '__test__.throw',
    namespace: '__test__',
    handler: 'Listeners.onThrow',
    error: true,
  });

  t.true(counterStub.calledOnce);
  t.deepEqual(counterStub.firstCall.args[1], {
    name: 'event_handler',
    event: '__test__.throw',
    namespace: '__test__',
    handler: 'Listeners.onThrow',
    error: true,
  });
});

test('should generate request id for event', async t => {
  const { eventbus, listeners } = t.context;

  await eventbus.emitAsync('__test__.requestId', {});

  t.true(listeners.onRequestId.lastCall.returnValue.includes(':event:'));
});

test('should continuously use the same request id', async t => {
  const { eventbus, listeners } = t.context;

  const cls = ClsServiceManager.getClsService();
  await cls.run(async () => {
    cls.set(CLS_ID, 'test-request-id');
    await eventbus.emitAsync('__test__.requestId', {});
  });

  t.true(listeners.onRequestId.lastCall.returned('test-request-id'));
});

test('should throw when emitting async event with uncaught error', async t => {
  const { eventbus } = t.context;

  await t.throwsAsync(
    () => eventbus.emitAsync('__test__.throw', { count: 0 }),
    {
      message: 'Error in event handler',
    }
  );
});

test('should suppress thrown error when emitting async event', async t => {
  const { eventbus } = t.context;
  const spy = Sinon.spy();
  // @ts-expect-error internal event
  const off = eventbus.on('error', spy);

  const promise = eventbus.emitAsync('__test__.suppressThrow', {});
  await t.notThrowsAsync(promise);

  t.true(spy.calledOnce);
  const args = spy.firstCall.args[0];
  t.is(args.event, '__test__.suppressThrow');
  t.deepEqual(args.payload, {});
  t.is(args.error.message, 'Error in event handler');

  const returns = await promise;
  t.deepEqual(returns, [undefined]);

  off();
});

test('should catch thrown error when emitting sync event', async t => {
  const { eventbus } = t.context;

  const spy = Sinon.spy();
  // @ts-expect-error internal event
  const off = eventbus.on('error', spy);
  t.notThrows(() => eventbus.emit('__test__.throw', { count: 0 }));

  // wait a tick
  await sleep(1);

  t.true(spy.calledOnce);
  const args = spy.firstCall.args[0];
  t.is(args.event, '__test__.throw');
  t.deepEqual(args.payload, { count: 0 });
  t.is(args.error.message, 'Error in event handler');

  off();
});
