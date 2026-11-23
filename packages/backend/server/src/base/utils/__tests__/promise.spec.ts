import test from 'ava';
import Sinon from 'sinon';

import {
  exponentialBackoffDelay,
  ExponentialBackoffScheduler,
} from '../promise';

test('exponentialBackoffDelay should cap exponential growth at maxDelayMs', t => {
  t.is(exponentialBackoffDelay(0, { baseDelayMs: 100, maxDelayMs: 500 }), 100);
  t.is(exponentialBackoffDelay(1, { baseDelayMs: 100, maxDelayMs: 500 }), 200);
  t.is(exponentialBackoffDelay(3, { baseDelayMs: 100, maxDelayMs: 500 }), 500);
});

test('ExponentialBackoffScheduler should track pending callback and increase delay per attempt', async t => {
  const clock = Sinon.useFakeTimers();
  t.teardown(() => {
    clock.restore();
  });

  const calls: number[] = [];
  const scheduler = new ExponentialBackoffScheduler({
    baseDelayMs: 100,
    maxDelayMs: 500,
  });

  t.is(
    scheduler.schedule(() => {
      calls.push(1);
    }),
    100
  );
  t.true(scheduler.pending);
  t.is(
    scheduler.schedule(() => {
      calls.push(2);
    }),
    null
  );

  await clock.tickAsync(100);
  t.deepEqual(calls, [1]);
  t.false(scheduler.pending);

  t.is(
    scheduler.schedule(() => {
      calls.push(3);
    }),
    200
  );
  await clock.tickAsync(200);
  t.deepEqual(calls, [1, 3]);
});

test('ExponentialBackoffScheduler reset should clear pending work and restart from the base delay', t => {
  const scheduler = new ExponentialBackoffScheduler({
    baseDelayMs: 100,
    maxDelayMs: 500,
  });

  t.is(
    scheduler.schedule(() => {}),
    100
  );
  t.true(scheduler.pending);

  scheduler.reset();
  t.false(scheduler.pending);
  t.is(
    scheduler.schedule(() => {}),
    100
  );

  scheduler.clear();
});
