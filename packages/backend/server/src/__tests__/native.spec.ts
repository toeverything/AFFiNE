import test from 'ava';

import { NativeStreamAdapter } from '../native';

test('NativeStreamAdapter should support buffered and awaited consumption', async t => {
  const adapter = new NativeStreamAdapter<number>(undefined);

  adapter.push(1);
  const first = await adapter.next();
  t.deepEqual(first, { value: 1, done: false });

  const pending = adapter.next();
  adapter.push(2);
  const second = await pending;
  t.deepEqual(second, { value: 2, done: false });

  adapter.push(null);
  const done = await adapter.next();
  t.true(done.done);
});

test('NativeStreamAdapter return should abort handle and end iteration', async t => {
  let abortCount = 0;
  const adapter = new NativeStreamAdapter<number>({
    abort: () => {
      abortCount += 1;
    },
  });

  const ended = await adapter.return();
  t.is(abortCount, 1);
  t.true(ended.done);

  const secondReturn = await adapter.return();
  t.true(secondReturn.done);
  t.is(abortCount, 1);

  const next = await adapter.next();
  t.true(next.done);
});

test('NativeStreamAdapter should abort when AbortSignal is triggered', async t => {
  let abortCount = 0;
  const controller = new AbortController();
  const adapter = new NativeStreamAdapter<number>(
    {
      abort: () => {
        abortCount += 1;
      },
    },
    controller.signal
  );

  const pending = adapter.next();
  controller.abort();
  const done = await pending;
  t.true(done.done);
  t.is(abortCount, 1);
});

test('NativeStreamAdapter should end immediately for pre-aborted signal', async t => {
  let abortCount = 0;
  const controller = new AbortController();
  controller.abort();

  const adapter = new NativeStreamAdapter<number>(
    {
      abort: () => {
        abortCount += 1;
      },
    },
    controller.signal
  );

  const next = await adapter.next();
  t.true(next.done);
  t.is(abortCount, 1);

  adapter.push(1);
  const stillDone = await adapter.next();
  t.true(stillDone.done);
});
