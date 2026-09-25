import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import test from 'ava';
import * as Y from 'yjs';

import { DocStoragePool } from '../index.js';

test('can batch read/write pool', async t => {
  const pool = new DocStoragePool();
  await pool.connect('test', ':memory:');

  const batch = 512;

  await Promise.all(
    Array.from({ length: batch }).map(async (_, i) => {
      return pool.setBlob('test', {
        key: `test-blob-${i}`,
        data: new Uint8Array([i % 255]),
        mime: 'text/plain',
      });
    })
  );

  const blobs = await Promise.all(
    Array.from({ length: batch }).map(async (_, i) => {
      return pool.getBlob('test', `test-blob-${i}`);
    })
  );

  t.is(blobs.length, batch);
  t.is(
    blobs.every((blob, i) => blob!.data.at(0) === i % 255),
    true
  );
});

test('getDoc matches Yjs updates and preserves incomplete inputs', async t => {
  const doc = new Y.Doc();
  doc.clientID = 11;
  const text = doc.getText('content');
  text.insert(0, 'one two');
  const first = Y.encodeStateAsUpdate(doc);
  const firstState = Y.encodeStateVector(doc);
  text.delete(4, 4);
  text.insert(4, 'three');
  const second = Y.encodeStateAsUpdate(doc, firstState);

  const peer = new Y.Doc();
  peer.clientID = 22;
  Y.applyUpdate(peer, first);
  peer.getText('content').insert(0, 'shared ');
  const concurrent = Y.encodeStateAsUpdate(peer, firstState);

  const root = new Y.Doc();
  root.clientID = 33;
  const pages = new Y.Array<Y.Map<unknown>>();
  for (const [id, trash] of [
    ['page', false],
    ['deleted', true],
  ] as const) {
    const page = new Y.Map<unknown>();
    page.set('id', id);
    page.set('trash', trash);
    pages.push([page]);
  }
  root.getMap('meta').set('pages', pages);
  const rootUpdate = Y.encodeStateAsUpdate(root);

  const cases = [
    { name: 'incremental', updates: [first, second] },
    {
      name: 'delete-set-and-concurrent',
      updates: [concurrent, second, first, second],
    },
    { name: 'root', updates: [rootUpdate] },
  ];
  const pool = new DocStoragePool();
  for (const item of cases) {
    await pool.connect(item.name, ':memory:');
    t.is(await pool.getDoc(item.name, item.name), null);
    for (const update of item.updates) {
      await pool.pushUpdate(item.name, item.name, update);
    }
    const record = await pool.getDoc(item.name, item.name);
    t.truthy(record);
    if (!record) continue;
    const expected = new Y.Doc();
    const actual = new Y.Doc();
    for (const update of item.updates) Y.applyUpdate(expected, update);
    Y.applyUpdate(actual, record.bin);
    t.deepEqual(actual.toJSON(), expected.toJSON());
    const state = (doc: Y.Doc) =>
      [...Y.decodeStateVector(Y.encodeStateVector(doc))].sort(
        ([a], [b]) => a - b
      );
    t.deepEqual(state(actual), state(expected));
    const replay = new Y.Doc();
    Y.applyUpdate(
      replay,
      Y.diffUpdate(record.bin, Y.encodeStateVector(replay))
    );
    t.deepEqual(replay.toJSON(), expected.toJSON());
    t.deepEqual(state(replay), state(expected));
    t.deepEqual((await pool.getDoc(item.name, item.name))?.bin, record.bin);
    await pool.disconnect(item.name);
  }

  await pool.connect('partial', ':memory:');
  await pool.pushUpdate('partial', 'partial', second);
  await t.throwsAsync(pool.getDoc('partial', 'partial'), {
    message: /missing dependencies/,
  });
  await pool.pushUpdate('partial', 'partial', first);
  const recovered = await pool.getDoc('partial', 'partial');
  t.truthy(recovered);
  const recoveredDoc = new Y.Doc();
  Y.applyUpdate(recoveredDoc, recovered!.bin);
  t.is(recoveredDoc.getText('content').toString(), 'one three');
  await pool.disconnect('partial');
});

test('deleted-workspace reads leave SQLite files unchanged', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'affine-readonly-'));
  const path = join(dir, 'storage.db');
  const pool = new DocStoragePool();
  try {
    await pool.connect('deleted', path);
    const root = new Y.Doc();
    root.getMap('meta').set('name', 'Deleted workspace');
    const first = Y.encodeStateAsUpdate(root);
    await pool.pushUpdate('deleted', 'deleted', first);
    await pool.getDoc('deleted', 'deleted');
    root.getMap('meta').set('name', 'Changed name');
    await pool.pushUpdate(
      'deleted',
      'deleted',
      Y.encodeStateAsUpdate(root, Y.encodeStateVectorFromUpdate(first))
    );
    const beforeFiles = await readdir(dir);
    const before = await Promise.all(
      beforeFiles
        .filter(file => !file.endsWith('-shm'))
        .map(async file => ({
          file,
          content: await readFile(join(dir, file)),
          mtime: (await stat(join(dir, file), { bigint: true })).mtimeNs,
        }))
    );
    const records = await pool.readDocRecordsReadonly(path, 'deleted');
    t.truthy(records.snapshot);
    t.is(records.updates.length, 1);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, records.snapshot!.bin);
    Y.applyUpdate(doc, records.updates[0].bin);
    t.is(doc.getMap('meta').get('name'), 'Changed name');
    const afterFiles = await readdir(dir);
    t.deepEqual(afterFiles, beforeFiles);
    for (const entry of before) {
      t.true(
        (await readFile(join(dir, entry.file))).equals(entry.content),
        entry.file
      );
      t.is(
        (await stat(join(dir, entry.file), { bigint: true })).mtimeNs,
        entry.mtime,
        entry.file
      );
    }
    await pool.disconnect('deleted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
