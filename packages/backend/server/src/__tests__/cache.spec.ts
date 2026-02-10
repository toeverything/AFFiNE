import { randomUUID } from 'node:crypto';

import { TestingModule } from '@nestjs/testing';
import test from 'ava';

import { FunctionalityModules } from '../app.module';
import { Cache } from '../base/cache';
import { createTestingModule } from './utils';

let cache: Cache;
let module: TestingModule;
const keyPrefix = `test:${randomUUID()}:`;
const key = (name: string) => `${keyPrefix}${name}`;
test.before(async () => {
  module = await createTestingModule({
    imports: FunctionalityModules,
  });
  cache = module.get(Cache);
});

test.after.always(async () => {
  await module.close();
});

test('should be able to set normal cache', async t => {
  t.true(await cache.set(key('test'), 1));
  t.is(await cache.get<number>(key('test')), 1);

  t.true(await cache.has(key('test')));
  t.true(await cache.delete(key('test')));
  t.is(await cache.get(key('test')), undefined);

  t.true(await cache.set(key('test'), { a: 1 }));
  t.deepEqual(await cache.get(key('test')), { a: 1 });
});

test('should be able to set cache with non-exiting flag', async t => {
  t.true(await cache.setnx(key('test-nx'), 1));
  t.false(await cache.setnx(key('test-nx'), 2));
  t.is(await cache.get(key('test-nx')), 1);
});

test('should be able to set cache with ttl', async t => {
  t.true(await cache.set(key('test-ttl'), 1));
  t.is(await cache.get(key('test-ttl')), 1);

  t.true(await cache.expire(key('test-ttl'), 1 * 1000));
  const ttl = await cache.ttl(key('test-ttl'));
  t.true(ttl <= 1 * 1000);
  t.true(ttl > 0);
});

test('should be able to incr/decr number cache', async t => {
  t.true(await cache.set(key('test-incr'), 1));
  t.is(await cache.increase(key('test-incr')), 2);
  t.is(await cache.increase(key('test-incr')), 3);
  t.is(await cache.decrease(key('test-incr')), 2);
  t.is(await cache.decrease(key('test-incr')), 1);

  // increase an nonexists number
  t.is(await cache.increase(key('test-incr2')), 1);
  t.is(await cache.increase(key('test-incr2')), 2);
});

test('should be able to manipulate list cache', async t => {
  t.is(await cache.pushBack(key('test-list'), 1), 1);
  t.is(await cache.pushBack(key('test-list'), 2, 3, 4), 4);
  t.is(await cache.len(key('test-list')), 4);

  t.deepEqual(await cache.list(key('test-list'), 1, -1), [2, 3, 4]);

  t.deepEqual(await cache.popFront(key('test-list'), 2), [1, 2]);
  t.deepEqual(await cache.popBack(key('test-list'), 1), [4]);

  t.is(await cache.pushBack(key('test-list2'), { a: 1 }), 1);
  t.deepEqual(await cache.popFront(key('test-list2'), 1), [{ a: 1 }]);
});

test('should be able to manipulate map cache', async t => {
  t.is(await cache.mapSet(key('test-map'), 'a', 1), true);
  t.is(await cache.mapSet(key('test-map'), 'b', 2), true);
  t.is(await cache.mapLen(key('test-map')), 2);

  t.is(await cache.mapGet(key('test-map'), 'a'), 1);
  t.is(await cache.mapGet(key('test-map'), 'b'), 2);

  t.is(await cache.mapIncrease(key('test-map'), 'a'), 2);
  t.is(await cache.mapIncrease(key('test-map'), 'a'), 3);
  t.is(await cache.mapDecrease(key('test-map'), 'b', 3), -1);

  const keys = await cache.mapKeys(key('test-map'));
  t.deepEqual(keys, ['a', 'b']);

  const randomKey = await cache.mapRandomKey(key('test-map'));
  t.truthy(randomKey);
  t.true(keys.includes(randomKey!));

  t.is(await cache.mapDelete(key('test-map'), 'a'), true);
  t.is(await cache.mapGet(key('test-map'), 'a'), undefined);
});
