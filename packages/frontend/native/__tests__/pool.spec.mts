import { DocStoragePool } from '../index';
import test from 'ava';

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
