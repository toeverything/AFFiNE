import { randomUUID } from 'node:crypto';

import { TestingModule } from '@nestjs/testing';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { Locker, Mutex } from '../base/mutex';
import { SessionRedis } from '../base/redis';
import { createTestingModule, sleep } from './utils';

const test = ava as TestFn<{
  module: TestingModule;
  mutex: Mutex;
  locker: Locker;
  session: SessionRedis;
}>;

test.beforeEach(async t => {
  const module = await createTestingModule();

  t.context.module = module;
  t.context.mutex = module.get(Mutex);
  t.context.locker = module.get(Locker);
  t.context.session = module.get(SessionRedis);
});

test.afterEach(async t => {
  await t.context.module.close();
});

const lockerPrefix = randomUUID();
test('should be able to acquire lock', async t => {
  const { mutex } = t.context;

  {
    t.truthy(
      await mutex.acquire(`${lockerPrefix}1`),
      'should be able to acquire lock'
    );
    t.falsy(
      await mutex.acquire(`${lockerPrefix}1`),
      'should not be able to acquire lock again'
    );
  }

  {
    const lock1 = await mutex.acquire(`${lockerPrefix}2`);
    t.truthy(lock1);
    await lock1?.release();
    const lock2 = await mutex.acquire(`${lockerPrefix}2`);
    t.truthy(lock2);
  }
});

test('should be able to acquire lock parallel', async t => {
  const { mutex, locker } = t.context;
  const spyedLocker = Sinon.spy(locker, 'lock');
  const requestLock = async (key: string) => {
    const lock = mutex.acquire(key);
    await using _lock = await lock;
    const lastCall = spyedLocker.lastCall.returnValue;
    try {
      // in rare cases, the lock can be acquired
      // in which case skip the error message check
      await lastCall;
    } catch {
      await t.throwsAsync(lastCall, {
        message: `Failed to acquire lock for resource [${key}]`,
      });
    }

    await sleep(100);
  };

  await t.notThrowsAsync(
    Promise.all(
      Array.from({ length: 10 }, _ => requestLock(`${lockerPrefix}3`))
    ),
    'should be able to acquire lock parallel'
  );
});

test('tryAcquire should only attempt to acquire the lock once', async t => {
  const { locker } = t.context;
  const lock = Sinon.stub(locker, 'lock').rejects(new Error('contended'));
  t.teardown(() => lock.restore());
  const mutex = new Mutex(locker);

  t.is(await mutex.tryAcquire(`${lockerPrefix}4`), undefined);
  t.is(lock.callCount, 1);
});
