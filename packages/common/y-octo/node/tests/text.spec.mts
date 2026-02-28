import assert, { equal, deepEqual } from 'node:assert';
import { test } from 'node:test';

import { Doc, type YText } from '../index';

test('text test', { concurrency: false }, async t => {
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

  await t.test('text should be created', () => {
    let text = doc.getOrCreateText('text');
    deepEqual(doc.keys, ['text']);
    equal(text.len, 0);
  });

  await t.test('text editing', () => {
    let text = doc.getOrCreateText('text');
    text.insert(0, 'a');
    text.insert(1, 'b');
    text.insert(2, 'c');
    equal(text.toString(), 'abc');
    text.remove(0, 1);
    equal(text.toString(), 'bc');
    text.remove(1, 1);
    equal(text.toString(), 'b');
    text.remove(0, 1);
    equal(text.toString(), '');
  });

  await t.test('sub text should can edit', () => {
    let map = doc.getOrCreateMap('map');
    let sub = doc.createText();
    map.set('sub', sub);

    sub.insert(0, 'a');
    sub.insert(1, 'b');
    sub.insert(2, 'c');
    equal(sub.toString(), 'abc');

    let sub2 = map.get<YText>('sub');
    assert(sub2);
    equal(sub2.toString(), 'abc');
  });
});
