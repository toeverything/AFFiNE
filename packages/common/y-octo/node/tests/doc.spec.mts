import { equal } from 'node:assert';
import { test } from 'node:test';

import { Doc } from '../index';
import * as Y from 'yjs';

test('doc test', { concurrency: false }, async t => {
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

  await t.test('doc id should be set', () => {
    equal(doc.clientId, client_id);
  });

  await t.test('y-octo doc update should be apply', () => {
    let array = doc.getOrCreateArray('array');
    let map = doc.getOrCreateMap('map');
    let text = doc.getOrCreateText('text');

    array.insert(0, true);
    array.insert(1, false);
    array.insert(2, 1);
    array.insert(3, 'hello world');
    map.set('a', true);
    map.set('b', false);
    map.set('c', 1);
    map.set('d', 'hello world');
    text.insert(0, 'a');
    text.insert(1, 'b');
    text.insert(2, 'c');

    let doc2 = new Doc(client_id);
    doc2.applyUpdate(doc.encodeStateAsUpdateV1());

    let array2 = doc2.getOrCreateArray('array');
    let map2 = doc2.getOrCreateMap('map');
    let text2 = doc2.getOrCreateText('text');

    equal(doc2.clientId, client_id);
    equal(array2.length, 4);
    equal(array2.get(0), true);
    equal(array2.get(1), false);
    equal(array2.get(2), 1);
    equal(array2.get(3), 'hello world');
    equal(map2.length, 4);
    equal(map2.get('a'), true);
    equal(map2.get('b'), false);
    equal(map2.get('c'), 1);
    equal(map2.get('d'), 'hello world');
    equal(text2.toString(), 'abc');
  });

  await t.test('yjs doc update should be apply', () => {
    let doc2 = new Y.Doc();
    let array2 = doc2.getArray('array');
    let map2 = doc2.getMap('map');
    let text2 = doc2.getText('text');

    array2.insert(0, [true]);
    array2.insert(1, [false]);
    array2.insert(2, [1]);
    array2.insert(3, ['hello world']);
    map2.set('a', true);
    map2.set('b', false);
    map2.set('c', 1);
    map2.set('d', 'hello world');
    text2.insert(0, 'a');
    text2.insert(1, 'b');
    text2.insert(2, 'c');

    doc.applyUpdate(Buffer.from(Y.encodeStateAsUpdate(doc2)));

    let array = doc.getOrCreateArray('array');
    let map = doc.getOrCreateMap('map');
    let text = doc.getOrCreateText('text');

    equal(array.length, 4);
    equal(array.get(0), true);
    equal(array.get(1), false);
    equal(array.get(2), 1);
    equal(array.get(3), 'hello world');
    equal(map.length, 4);
    equal(map.get('a'), true);
    equal(map.get('b'), false);
    equal(map.get('c'), 1);
    equal(map.get('d'), 'hello world');
    equal(text.toString(), 'abc');
  });
});
