import assert, { doesNotThrow } from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { lastValueFrom, Subject } from 'rxjs';
import { v4 } from 'uuid';

import { FsWatcher } from '../index';

test('fs watch', { concurrency: false }, async t => {
  let watcher: FsWatcher;
  let fixture: string;
  t.beforeEach(async () => {
    const fixtureName = `fs-${v4()}.fixture`;
    fixture = join(fileURLToPath(import.meta.url), '..', fixtureName);
    await fs.writeFile(fixture, '\n');
    watcher = FsWatcher.watch(fixture);
  });

  t.afterEach(async () => {
    FsWatcher.close();
    await fs.unlink(fixture).catch(() => false);
  });

  await t.test('should watch without error', () => {
    doesNotThrow(() => {
      const subscription = watcher.subscribe(() => {});
      subscription.unsubscribe();
    });
  });

  await t.test('should watch file change', () => {
    return (async () => {
      const defer = new Subject<void>();
      const subscription = watcher.subscribe(
        event => {
          assert.deepEqual(event.paths, [fixture]);
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
      return lastValueFrom(defer.asObservable());
    })();
  });

  await t.test('should watch file delete', () => {
    return (async () => {
      const defer = new Subject<void>();
      const subscription = watcher.subscribe(
        event => {
          if (typeof event.type === 'object' && 'rename' in event.type) {
            assert.deepEqual(event.paths, [fixture]);
            assert.deepEqual(event.type, {
              remove: {
                kind: 'file',
              },
            });
          }
          subscription.unsubscribe();
          defer.next();
          defer.complete();
        },
        err => {
          subscription.unsubscribe();
          defer.error(err);
        }
      );
      await fs.unlink(fixture);
      return lastValueFrom(defer.asObservable());
    })();
  });
});
