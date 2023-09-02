import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import test from 'ava';
import { lastValueFrom, Subject } from 'rxjs';
import { v4 } from 'uuid';

import { FsWatcher } from '../index';

let watcher: FsWatcher;
let fixture: string;

test.before(async () => {
  const fixtureName = `fs-${v4()}.fixture`;
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  fixture = resolve(__dirname, 'fixtures', fixtureName);
  await fs.writeFile(fixture, '\n');
  watcher = FsWatcher.watch(fixture);
});

test.after(async () => {
  FsWatcher.close();
  await fs.rm(fixture).catch(() => false);
});

test('should watch without error', t => {
  t.notThrows(() => {
    const subscription = watcher.subscribe(() => {});
    subscription.unsubscribe();
  });
});

// the following tests will always be hanging
test('should watch file change', async t => {
  const defer = new Subject<void>();
  const subscription = watcher.subscribe(
    event => {
      t.deepEqual(event.paths, [fixture]);
      subscription.unsubscribe();
      defer.next();
      defer.complete();
    },
    err => {
      subscription.unsubscribe();
      defer.error(err);
    }
  );
  await fs.appendFile(fixture, 'test');
  await lastValueFrom(defer.asObservable());
});

test('should watch file delete', async t => {
  const defer = new Subject<void>();
  const subscription = watcher.subscribe(
    event => {
      if (typeof event.type === 'object' && 'remove' in event.type) {
        t.deepEqual(event.paths, [fixture]);
        t.deepEqual(event.type, {
          remove: {
            kind: 'file',
          },
        });
        subscription.unsubscribe();
        defer.next();
        defer.complete();
      }
    },
    err => {
      subscription.unsubscribe();
      defer.error(err);
    }
  );
  await fs.rm(fixture);
  await lastValueFrom(defer.asObservable());
});
