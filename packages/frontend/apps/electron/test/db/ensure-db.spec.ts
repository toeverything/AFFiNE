import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { removeWithRetry } from '@affine-test/kit/utils/utils';
import { v4 } from 'uuid';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp');
const appDataPath = path.join(tmpDir, 'app-data');

vi.doMock('@affine/electron/helper/main-rpc', () => ({
  mainRPC: {
    getPath: async () => appDataPath,
  },
}));

const constructorStub = vi.fn();
const destroyStub = vi.fn();
destroyStub.mockReturnValue(Promise.resolve());

function existProcess() {
  process.emit('beforeExit', 0);
}

vi.doMock('@affine/electron/helper/db/secondary-db', () => {
  return {
    SecondaryWorkspaceSQLiteDB: class {
      constructor(...args: any[]) {
        constructorStub(...args);
      }

      connectIfNeeded = () => Promise.resolve();

      pull = () => Promise.resolve();

      destroy = destroyStub;
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(async () => {
  existProcess();
  await removeWithRetry(tmpDir);
  vi.useRealTimers();
});

afterAll(() => {
  vi.doUnmock('@affine/electron/helper/main-rpc');
});

test('can get a valid WorkspaceSQLiteDB', async () => {
  const { ensureSQLiteDB } = await import(
    '@affine/electron/helper/db/ensure-db'
  );
  const workspaceId = v4();
  const db0 = await ensureSQLiteDB('workspace', workspaceId);
  expect(db0).toBeDefined();
  expect(db0.workspaceId).toBe(workspaceId);

  const db1 = await ensureSQLiteDB('workspace', v4());
  expect(db1).not.toBe(db0);
  expect(db1.workspaceId).not.toBe(db0.workspaceId);

  // ensure that the db is cached
  expect(await ensureSQLiteDB('workspace', workspaceId)).toBe(db0);
});

test('db should be destroyed when app quits', async () => {
  const { ensureSQLiteDB } = await import(
    '@affine/electron/helper/db/ensure-db'
  );
  const workspaceId = v4();
  const db0 = await ensureSQLiteDB('workspace', workspaceId);
  const db1 = await ensureSQLiteDB('workspace', v4());

  expect(db0.adapter).not.toBeNull();
  expect(db1.adapter).not.toBeNull();

  existProcess();

  // wait the async `db.destroy()` to be called
  await setTimeout(100);

  expect(db0.adapter.db).toBeNull();
  expect(db1.adapter.db).toBeNull();
});

test('db should be removed in db$Map after destroyed', async () => {
  const { ensureSQLiteDB, db$Map } = await import(
    '@affine/electron/helper/db/ensure-db'
  );
  const workspaceId = v4();
  const db = await ensureSQLiteDB('workspace', workspaceId);
  await db.destroy();
  await setTimeout(100);
  expect(db$Map.has(`workspace:${workspaceId}`)).toBe(false);
});
