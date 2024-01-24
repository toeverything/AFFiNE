import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import test from 'ava';
import { getStreamAsBuffer } from 'get-stream';

import { ListObjectsMetadata } from '../providers';
import { FsStorageProvider } from '../providers/fs';

const config = {
  path: join(process.cwd(), 'node_modules', '.cache/affine-test-storage'),
};

function createProvider() {
  return new FsStorageProvider(
    config,
    'test' + Math.random().toString(16).substring(2, 8)
  );
}

function keys(list: ListObjectsMetadata[]) {
  return list.map(i => i.key);
}

async function randomPut(
  provider: FsStorageProvider,
  prefix = ''
): Promise<string> {
  const key = prefix + 'test-key-' + Math.random().toString(16).substring(2, 8);
  const body = Buffer.from(key);
  provider.put(key, body);
  return key;
}

test.after.always(() => {
  fs.rm(config.path, { recursive: true });
});

test('put & get', async t => {
  const provider = createProvider();
  const key = 'testKey';
  const body = Buffer.from('testBody');
  await provider.put(key, body);

  const result = await provider.get(key);

  t.deepEqual(await getStreamAsBuffer(result.body!), body);
  t.is(result.metadata?.contentLength, body.length);
});

test('list - one level', async t => {
  const provider = createProvider();
  const list = await Promise.all(
    Array.from({ length: 100 }).map(() => randomPut(provider))
  );
  list.sort();
  // random order, use set
  const result = await provider.list();
  t.deepEqual(keys(result), list);

  const result2 = await provider.list('test-key');
  t.deepEqual(keys(result2), list);

  const result3 = await provider.list('testKey');
  t.is(result3.length, 0);
});

test('list recursively', async t => {
  const provider = createProvider();

  await Promise.all([
    Promise.all(Array.from({ length: 10 }).map(() => randomPut(provider))),
    Promise.all(
      Array.from({ length: 10 }).map(() => randomPut(provider, 'a/'))
    ),
    Promise.all(
      Array.from({ length: 10 }).map(() => randomPut(provider, 'a/b/'))
    ),
    Promise.all(
      Array.from({ length: 10 }).map(() => randomPut(provider, 'a/b/t/'))
    ),
  ]);

  const r1 = await provider.list();
  t.is(r1.length, 40);

  // contains all `a/xxx` and `a/b/xxx` and `a/b/c/xxx`
  const r2 = await provider.list('a');
  t.is(r2.length, 30);

  // contains only `a/b/xxx`
  const r3 = await provider.list('a/b');
  const r4 = await provider.list('a/b/');
  t.is(r3.length, 20);
  t.deepEqual(r3, r4);

  // prefix is not ended with '/', it's open to all files and sub dirs
  // contains all `a/b/t/xxx` and `a/b/t{xxxx}`
  const r5 = await provider.list('a/b/t');

  t.is(r5.length, 20);
});

test('delete', async t => {
  const provider = createProvider();
  const key = 'testKey';
  const body = Buffer.from('testBody');
  await provider.put(key, body);

  await provider.delete(key);

  await t.throwsAsync(() => fs.access(join(config.path, provider.bucket, key)));
});
