import { TestingModule } from '@nestjs/testing';
import test from 'ava';

import { FunctionalityModules } from '../app.module';
import { Cache } from '../base/cache';
import { createTestingModule } from './utils';

let cache: Cache;
let module: TestingModule;
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
  t.true(await cache.set('test', 1));
  t.is(await cache.get<number>('test'), 1);

  t.true(await cache.has('test'));
  t.true(await cache.delete('test'));
  t.is(await cache.get('test'), undefined);

  t.true(await cache.set('test', { a: 1 }));
  t.deepEqual(await cache.get('test'), { a: 1 });
});

test('should be able to set cache with non-exiting flag', async t => {
  t.true(await cache.setnx('test-nx', 1));
  t.false(await cache.setnx('test-nx', 2));
  t.is(await cache.get('test-nx'), 1);
});

test('should be able to set cache with ttl', async t => {
  t.true(await cache.set('test-ttl', 1));
  t.is(await cache.get('test-ttl'), 1);

  t.true(await cache.expire('test-ttl', 1 * 1000));
  const ttl = await cache.ttl('test-ttl');
  t.true(ttl <= 1 * 1000);
  t.true(ttl > 0);
});

test('should be able to incr/decr number cache', async t => {
  t.true(await cache.set('test-incr', 1));
  t.is(await cache.increase('test-incr'), 2);
  t.is(await cache.increase('test-incr'), 3);
  t.is(await cache.decrease('test-incr'), 2);
  t.is(await cache.decrease('test-incr'), 1);

  // increase an nonexists number
  t.is(await cache.increase('test-incr2'), 1);
  t.is(await cache.increase('test-incr2'), 2);
});

test('should be able to manipulate list cache', async t => {
  t.is(await cache.pushBack('test-list', 1), 1);
  t.is(await cache.pushBack('test-list', 2, 3, 4), 4);
  t.is(await cache.len('test-list'), 4);

  t.deepEqual(await cache.list('test-list', 1, -1), [2, 3, 4]);

  t.deepEqual(await cache.popFront('test-list', 2), [1, 2]);
  t.deepEqual(await cache.popBack('test-list', 1), [4]);

  t.is(await cache.pushBack('test-list2', { a: 1 }), 1);
  t.deepEqual(await cache.popFront('test-list2', 1), [{ a: 1 }]);
});

test('should be able to manipulate map cache', async t => {
  t.is(await cache.mapSet('test-map', 'a', 1), true);
  t.is(await cache.mapSet('test-map', 'b', 2), true);
  t.is(await cache.mapLen('test-map'), 2);

  t.is(await cache.mapGet('test-map', 'a'), 1);
  t.is(await cache.mapGet('test-map', 'b'), 2);

  t.is(await cache.mapIncrease('test-map', 'a'), 2);
  t.is(await cache.mapIncrease('test-map', 'a'), 3);
  t.is(await cache.mapDecrease('test-map', 'b', 3), -1);

  const keys = await cache.mapKeys('test-map');
  t.deepEqual(keys, ['a', 'b']);

  const randomKey = await cache.mapRandomKey('test-map');
  t.truthy(randomKey);
  t.true(keys.includes(randomKey!));

  t.is(await cache.mapDelete('test-map', 'a'), true);
  t.is(await cache.mapGet('test-map', 'a'), undefined);
});
