import assert, { equal, deepEqual } from 'node:assert';
import { test } from 'node:test';

import * as Y from 'yjs';
import { Doc, type YArray, type YMap, type YText } from '../index';

test('map test', { concurrency: false }, async t => {
  let client_id: number;
  let doc: Doc;
  t.beforeEach(async () => {
    client_id = (Math.random() * 100000) | 0;
    doc = new Doc(client_id);
  });

  t.afterEach(async () => {
    client_id = -1;
    // @ts-expect-error - doc must not null in next range
    doc = null;
  });

  await t.test('map should be created', () => {
    let map = doc.getOrCreateMap('map');
    deepEqual(doc.keys, ['map']);
    equal(map.length, 0);
  });

  await t.test('map editing', () => {
    let map = doc.getOrCreateMap('map');
    map.set('a', true);
    map.set('b', false);
    map.set('c', 1);
    map.set('d', 'hello world');
    equal(map.length, 4);
    equal(map.get('a'), true);
    equal(map.get('b'), false);
    equal(map.get('c'), 1);
    equal(map.get('d'), 'hello world');
    equal(map.length, 4);
    map.remove('b');
    equal(map.length, 3);
    equal(map.get('d'), 'hello world');
  });

  await t.test('map should can be nested', () => {
    let map = doc.getOrCreateMap('map');
    let sub = doc.createMap();
    map.set('sub', sub);

    sub.set('a', true);
    sub.set('b', false);
    sub.set('c', 1);
    sub.set('d', 'hello world');
    equal(sub.length, 4);

    let sub2 = map.get<YMap>('sub');
    assert(sub2);
    equal(sub2.get('a'), true);
    equal(sub2.get('b'), false);
    equal(sub2.get('c'), 1);
    equal(sub2.get('d'), 'hello world');
    equal(sub2.length, 4);
  });

  await t.test('y-octo to yjs compatibility test with nested type', () => {
    let map = doc.getOrCreateMap('map');
    let sub_array = doc.createArray();
    let sub_map = doc.createMap();
    let sub_text = doc.createText();

    map.set('array', sub_array);
    map.set('map', sub_map);
    map.set('text', sub_text);

    sub_array.insert(0, true);
    sub_array.insert(1, false);
    sub_array.insert(2, 1);
    sub_array.insert(3, 'hello world');
    sub_map.set('a', true);
    sub_map.set('b', false);
    sub_map.set('c', 1);
    sub_map.set('d', 'hello world');
    sub_text.insert(0, 'a');
    sub_text.insert(1, 'b');
    sub_text.insert(2, 'c');

    let doc2 = new Y.Doc();
    Y.applyUpdate(doc2, doc.encodeStateAsUpdateV1());

    let map2 = doc2.getMap<any>('map');
    let sub_array2 = map2.get('array') as Y.Array<any>;
    let sub_map2 = map2.get('map') as Y.Map<any>;
    let sub_text2 = map2.get('text') as Y.Text;

    assert(sub_array2);
    equal(sub_array2.length, 4);
    equal(sub_array2.get(0), true);
    equal(sub_array2.get(1), false);
    equal(sub_array2.get(2), 1);
    equal(sub_array2.get(3), 'hello world');
    assert(sub_map2);
    equal(sub_map2.get('a'), true);
    equal(sub_map2.get('b'), false);
    equal(sub_map2.get('c'), 1);
    equal(sub_map2.get('d'), 'hello world');
    assert(sub_text2);
    equal(sub_text2.toString(), 'abc');
  });

  await t.test('yjs to y-octo compatibility test with nested type', () => {
    let doc2 = new Y.Doc();
    let map2 = doc2.getMap<any>('map');
    let sub_array2 = new Y.Array<any>();
    let sub_map2 = new Y.Map<any>();
    let sub_text2 = new Y.Text();
    map2.set('array', sub_array2);
    map2.set('map', sub_map2);
    map2.set('text', sub_text2);

    sub_array2.insert(0, [true]);
    sub_array2.insert(1, [false]);
    sub_array2.insert(2, [1]);
    sub_array2.insert(3, ['hello world']);
    sub_map2.set('a', true);
    sub_map2.set('b', false);
    sub_map2.set('c', 1);
    sub_map2.set('d', 'hello world');
    sub_text2.insert(0, 'a');
    sub_text2.insert(1, 'b');
    sub_text2.insert(2, 'c');

    doc.applyUpdate(Buffer.from(Y.encodeStateAsUpdate(doc2)));

    let map = doc.getOrCreateMap('map');
    let sub_array = map.get<YArray>('array');
    let sub_map = map.get<YMap>('map');
    let sub_text = map.get<YText>('text');

    assert(sub_array);
    equal(sub_array.length, 4);
    equal(sub_array.get(0), true);
    equal(sub_array.get(1), false);
    equal(sub_array.get(2), 1);
    equal(sub_array.get(3), 'hello world');
    assert(sub_map);
    equal(sub_map.get('a'), true);
    equal(sub_map.get('b'), false);
    equal(sub_map.get('c'), 1);
    equal(sub_map.get('d'), 'hello world');
    assert(sub_text);
    equal(sub_text.toString(), 'abc');
  });
});
