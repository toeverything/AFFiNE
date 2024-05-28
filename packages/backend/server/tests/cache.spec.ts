import { TestingModule } from '@nestjs/testing';
import test from 'ava';

import { Cache } from '../src/fundamentals/cache';
import { createTestingModule } from './utils';

let cache: Cache;
let module: TestingModule;
test.beforeEach(async () => {
  module = await createTestingModule();
  const prefix = Math.random().toString(36).slice(2, 7);
  cache = new Proxy(module.get(Cache), {
    get(target, prop) {
      // @ts-expect-error safe
      const fn = target[prop];
      if (typeof fn === 'function') {
        // replase first parameter of fn with prefix
        return (...args: any[]) =>
          fn.call(target, `${prefix}:${args[0]}`, ...args.slice(1));
      }

      return fn;
    },
  });
});

test.afterEach(async () => {
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
  t.true(await cache.setnx('test', 1));
  t.false(await cache.setnx('test', 2));
  t.is(await cache.get('test'), 1);
});

test('should be able to set cache with ttl', async t => {
  t.true(await cache.set('test', 1));
  t.is(await cache.get('test'), 1);

  t.true(await cache.expire('test', 1 * 1000));
  const ttl = await cache.ttl('test');
  t.true(ttl <= 1 * 1000);
  t.true(ttl > 0);
});

test('should be able to incr/decr number cache', async t => {
  t.true(await cache.set('test', 1));
  t.is(await cache.increase('test'), 2);
  t.is(await cache.increase('test'), 3);
  t.is(await cache.decrease('test'), 2);
  t.is(await cache.decrease('test'), 1);

  // increase an nonexists number
  t.is(await cache.increase('test2'), 1);
  t.is(await cache.increase('test2'), 2);
});

test('should be able to manipulate list cache', async t => {
  t.is(await cache.pushBack('test', 1), 1);
  t.is(await cache.pushBack('test', 2, 3, 4), 4);
  t.is(await cache.len('test'), 4);

  t.deepEqual(await cache.list('test', 1, -1), [2, 3, 4]);

  t.deepEqual(await cache.popFront('test', 2), [1, 2]);
  t.deepEqual(await cache.popBack('test', 1), [4]);

  t.is(await cache.pushBack('test2', { a: 1 }), 1);
  t.deepEqual(await cache.popFront('test2', 1), [{ a: 1 }]);
});

test('should be able to manipulate map cache', async t => {
  t.is(await cache.mapSet('test', 'a', 1), true);
  t.is(await cache.mapSet('test', 'b', 2), true);
  t.is(await cache.mapLen('test'), 2);

  t.is(await cache.mapGet('test', 'a'), 1);
  t.is(await cache.mapGet('test', 'b'), 2);

  t.is(await cache.mapIncrease('test', 'a'), 2);
  t.is(await cache.mapIncrease('test', 'a'), 3);
  t.is(await cache.mapDecrease('test', 'b', 3), -1);

  const keys = await cache.mapKeys('test');
  t.deepEqual(keys, ['a', 'b']);

  const randomKey = await cache.mapRandomKey('test');
  t.truthy(randomKey);
  t.true(keys.includes(randomKey!));

  t.is(await cache.mapDelete('test', 'a'), true);
  t.is(await cache.mapGet('test', 'a'), undefined);
});
