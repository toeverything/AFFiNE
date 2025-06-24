import { Subject } from 'rxjs';
import { describe, expect, test } from 'vitest';
import * as Y from 'yjs';

import { ReactiveFlatYMap } from '../reactive/flat-native-y/index.js';
import type { Text } from '../reactive/index.js';
import { Boxed, createYProxy, popProp, stashProp } from '../reactive/index.js';

describe('array', () => {
  test('push and splice', () => {
    const ydoc = new Y.Doc();
    const arr = ydoc.getArray('arr');
    arr.push([0, 1, 2, 3, 4, 5]);

    const proxy = createYProxy(arr) as unknown[];
    expect(arr.toJSON()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(proxy).toEqual([0, 1, 2, 3, 4, 5]);

    proxy.push(6);
    expect(arr.toJSON()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(proxy).toEqual([0, 1, 2, 3, 4, 5, 6]);

    proxy.splice(1, 1);
    expect(arr.toJSON()).toEqual([0, 2, 3, 4, 5, 6]);
    expect(proxy).toEqual([0, 2, 3, 4, 5, 6]);

    proxy[0] = 2;
    expect(arr.toJSON()).toEqual([2, 2, 3, 4, 5, 6]);
    expect(proxy).toEqual([2, 2, 3, 4, 5, 6]);
  });

  test('shift and unshift', () => {
    const ydoc = new Y.Doc();
    const arr = ydoc.getArray('arr');
    arr.push([0, 1, 2, 3, 4, 5]);

    const proxy = createYProxy(arr) as unknown[];
    expect(arr.toJSON()).toEqual([0, 1, 2, 3, 4, 5]);

    // Test shift
    const shifted = proxy.shift();
    expect(shifted).toBe(0);
    expect(arr.toJSON()).toEqual([1, 2, 3, 4, 5]);
    expect(proxy).toEqual([1, 2, 3, 4, 5]);

    const shifted2 = proxy.shift();
    expect(shifted2).toBe(1);
    expect(arr.toJSON()).toEqual([2, 3, 4, 5]);
    expect(proxy).toEqual([2, 3, 4, 5]);

    // Test shift on empty array
    const emptyArr = ydoc.getArray('empty');
    const emptyProxy = createYProxy(emptyArr) as unknown[];
    const emptyShifted = emptyProxy.shift();
    expect(emptyShifted).toBeUndefined();
    expect(emptyArr.toJSON()).toEqual([]);
    expect(emptyProxy).toEqual([]);

    // Test unshift
    proxy.unshift(-1, 0, 1);
    expect(arr.toJSON()).toEqual([-1, 0, 1, 2, 3, 4, 5]);
    expect(proxy).toEqual([-1, 0, 1, 2, 3, 4, 5]);

    // Test unshift with multiple items
    proxy.unshift(-3, -2);
    expect(arr.toJSON()).toEqual([-3, -2, -1, 0, 1, 2, 3, 4, 5]);
    expect(proxy).toEqual([-3, -2, -1, 0, 1, 2, 3, 4, 5]);
  });
});

describe('object', () => {
  test('deep', () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('map');
    const obj = new Y.Map();
    obj.set('foo', 1);
    map.set('obj', obj);
    map.set('num', 0);
    const map2 = new Y.Map();
    obj.set('map', map2);
    map2.set('foo', 40);

    const proxy = createYProxy<Record<string, any>>(map);

    expect(proxy.num).toBe(0);
    expect(proxy.obj.foo).toBe(1);
    expect(proxy.obj.map.foo).toBe(40);

    proxy.obj.bar = 100;
    expect(obj.get('bar')).toBe(100);

    proxy.obj2 = { foo: 2, bar: { num: 3 } };
    expect(map.get('obj2')).toBeInstanceOf(Y.Map);
    // @ts-expect-error ignore
    expect(map.get('obj2').get('bar').get('num')).toBe(3);

    proxy.obj2.bar.str = 'hello';
    // @ts-expect-error ignore
    expect(map.get('obj2').get('bar').get('str')).toBe('hello');

    proxy.obj3 = {};
    const { obj3 } = proxy;
    obj3.id = 'obj3';
    expect((map.get('obj3') as Y.Map<string>).get('id')).toBe('obj3');

    proxy.arr = [];
    expect(map.get('arr')).toBeInstanceOf(Y.Array);
    proxy.arr.push({ counter: 1 });
    expect((map.get('arr') as Y.Array<Y.Map<number>>).get(0)).toBeInstanceOf(
      Y.Map
    );
    expect(
      (map.get('arr') as Y.Array<Y.Map<number>>).get(0).get('counter')
    ).toBe(1);
  });

  test('with y text', () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('map');
    const inner = new Y.Map();
    map.set('inner', inner);
    const text = new Y.Text('hello');
    inner.set('text', text);

    const proxy = createYProxy<{ inner: { text: Text } }>(map);
    proxy.inner = { ...proxy.inner };
    expect(proxy.inner.text.yText).toBeInstanceOf(Y.Text);
    expect(proxy.inner.text.yText.toJSON()).toBe('hello');
  });

  test('with native wrapper', () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('map');
    const inner = new Y.Map();
    map.set('inner', inner);
    const native = new Boxed(['hello', 'world']);
    inner.set('native', native.yMap);

    const proxy = createYProxy<{
      inner: {
        native: Boxed<string[]>;
        native2: Boxed<number>;
      };
    }>(map);

    expect(proxy.inner.native.getValue()).toEqual(['hello', 'world']);

    proxy.inner.native.setValue(['hello', 'world', 'foo']);
    expect(native.getValue()).toEqual(['hello', 'world', 'foo']);
    // @ts-expect-error ignore
    expect(map.get('inner').get('native').get('value')).toEqual([
      'hello',
      'world',
      'foo',
    ]);

    const native2 = new Boxed(0);
    proxy.inner.native2 = native2;
    // @ts-expect-error ignore
    expect(map.get('inner').get('native2').get('value')).toBe(0);
    native2.setValue(1);
    // @ts-expect-error ignore
    expect(map.get('inner').get('native2').get('value')).toBe(1);
  });
});

describe('stash and pop', () => {
  test('object', () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('map');
    map.set('num', 0);

    const proxy = createYProxy<Record<string, any>>(map);

    expect(proxy.num).toBe(0);
    stashProp(map, 'num');
    proxy.num = 1;
    expect(proxy.num).toBe(1);
    expect(map.get('num')).toBe(0);
    proxy.num = 2;
    popProp(map, 'num');
    expect(map.get('num')).toBe(2);
  });

  test('array', () => {
    const ydoc = new Y.Doc();
    const arr = ydoc.getArray('arr');
    arr.push([0]);

    const proxy = createYProxy<Record<string, any>>(arr);

    expect(proxy[0]).toBe(0);
    stashProp(arr, 0);
    proxy[0] = 1;
    expect(proxy[0]).toBe(1);
    expect(arr.get(0)).toBe(0);
    popProp(arr, 0);
    expect(arr.get(0)).toBe(1);
  });

  test('nested', () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('map');
    const arr = new Y.Array();
    map.set('arr', arr);
    arr.push([0]);

    const proxy = createYProxy<Record<string, any>>(map);

    expect(proxy.arr[0]).toBe(0);
    stashProp(arr, 0);
    proxy.arr[0] = 1;
    expect(proxy.arr[0]).toBe(1);
    expect(arr.get(0)).toBe(0);
    popProp(arr, 0);
    expect(arr.get(0)).toBe(1);
  });
});

test('flat', () => {
  const ydoc = new Y.Doc();
  const map = ydoc.getMap('map');
  map.set('prop:col.a', 0);
  map.set('prop:col.b', 1);
  map.set('prop:col.c.d', 3);
  map.set('prop:col.c.e', 4);

  const reactive = new ReactiveFlatYMap(map, new Subject());
  const proxy = reactive.proxy as Record<string, any>;
  proxy.col.c.d = 200;
  expect(map.get('prop:col.c.d')).toBe(200);

  proxy.col.a = 200;
  expect(map.get('prop:col.a')).toBe(200);

  proxy.col.f = { a: 1 };
  expect(map.get('prop:col.f.a')).toBe(1);

  proxy.foo = 'foo';
  expect(map.get('prop:foo')).toBe('foo');

  proxy.col.c = {
    d: 500,
  };
  expect(map.get('prop:col.c.d')).toBe(500);
  expect(map.get('prop:col.c.e')).toBe(undefined);

  proxy.col.a = 100;
  expect(map.get('prop:col.a')).toBe(100);
  proxy.col.c.e = 100;
  expect(map.get('prop:col.c.e')).toBe(100);

  const undoManager = new Y.UndoManager([map]);

  ydoc.transact(() => {
    map.set('prop:col.c.e', 200);
  }, undoManager);
  expect(proxy.col.c.e).toBe(200);

  ydoc.transact(() => {
    map.delete('prop:col.c.d');
  }, undoManager);
  expect(proxy.col.c.d).toBe(undefined);

  proxy.foo$.value = 'foo2';
  expect(map.get('prop:foo')).toBe('foo2');

  proxy.col$.value = {
    a: 10,
    b: 20,
    c: {
      d: 30,
    },
  };
  expect(map.get('prop:col.a')).toBe(10);
  expect(map.get('prop:col.b')).toBe(20);
  expect(map.get('prop:col.c.d')).toBe(30);
});
