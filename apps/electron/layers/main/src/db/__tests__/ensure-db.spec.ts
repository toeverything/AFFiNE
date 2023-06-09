import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const tmpDir = path.join(__dirname, 'tmp');

const registeredHandlers = new Map<
  string,
  ((...args: any[]) => Promise<any>)[]
>();

const SESSION_DATA_PATH = path.join(tmpDir, 'affine-test');
const DOCUMENTS_PATH = path.join(tmpDir, 'affine-test-documents');

const electronModule = {
  app: {
    getPath: (name: string) => {
      if (name === 'sessionData') {
        return SESSION_DATA_PATH;
      } else if (name === 'documents') {
        return DOCUMENTS_PATH;
      }
      throw new Error('not implemented');
    },
    name: 'affine-test',
    on: (name: string, callback: (...args: any[]) => any) => {
      const handlers = registeredHandlers.get(name) || [];
      handlers.push(callback);
      registeredHandlers.set(name, handlers);
    },
    addListener: (...args: any[]) => {
      // @ts-expect-error
      electronModule.app.on(...args);
    },
    removeListener: () => {},
  },
  shell: {} as Partial<Electron.Shell>,
  dialog: {} as Partial<Electron.Dialog>,
};

const runHandler = async (key: string) => {
  await Promise.all(
    (registeredHandlers.get(key) ?? []).map(handler => handler())
  );
};

// dynamically import handlers so that we can inject local variables to mocks
vi.doMock('electron', () => {
  return electronModule;
});

const constructorStub = vi.fn();
const destroyStub = vi.fn();
destroyStub.mockReturnValue(Promise.resolve());

vi.doMock('../secondary-db', () => {
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
  await runHandler('before-quit');
  // wait for the db to be closed on Windows
  if (process.platform === 'win32') {
    await setTimeout(200);
  }
  await fs.remove(tmpDir);
  vi.useRealTimers();
});

test('can get a valid WorkspaceSQLiteDB', async () => {
  const { ensureSQLiteDB } = await import('../ensure-db');
  const workspaceId = v4();
  const db0 = await ensureSQLiteDB(workspaceId);
  expect(db0).toBeDefined();
  expect(db0.workspaceId).toBe(workspaceId);

  const db1 = await ensureSQLiteDB(v4());
  expect(db1).not.toBe(db0);
  expect(db1.workspaceId).not.toBe(db0.workspaceId);

  // ensure that the db is cached
  expect(await ensureSQLiteDB(workspaceId)).toBe(db0);
});

test('db should be destroyed when app quits', async () => {
  const { ensureSQLiteDB } = await import('../ensure-db');
  const workspaceId = v4();
  const db0 = await ensureSQLiteDB(workspaceId);
  const db1 = await ensureSQLiteDB(v4());

  expect(db0.db).not.toBeNull();
  expect(db1.db).not.toBeNull();

  await runHandler('before-quit');

  // wait the async `db.destroy()` to be called
  await setTimeout(100);

  expect(db0.db).toBeNull();
  expect(db1.db).toBeNull();
});

test('db should be removed in db$Map after destroyed', async () => {
  const { ensureSQLiteDB, db$Map } = await import('../ensure-db');
  const workspaceId = v4();
  const db = await ensureSQLiteDB(workspaceId);
  await db.destroy();
  await setTimeout(100);
  expect(db$Map.has(workspaceId)).toBe(false);
});

test('if db has a secondary db path, we should also poll that', async () => {
  const { ensureSQLiteDB } = await import('../ensure-db');
  const { appContext } = await import('../../context');
  const { storeWorkspaceMeta } = await import('../../workspace');
  const workspaceId = v4();
  await storeWorkspaceMeta(appContext, workspaceId, {
    secondaryDBPath: path.join(tmpDir, 'secondary.db'),
  });

  const db = await ensureSQLiteDB(workspaceId);

  await setTimeout(10);

  expect(constructorStub).toBeCalledTimes(1);
  expect(constructorStub).toBeCalledWith(path.join(tmpDir, 'secondary.db'), db);

  // if secondary meta is changed
  await storeWorkspaceMeta(appContext, workspaceId, {
    secondaryDBPath: path.join(tmpDir, 'secondary2.db'),
  });

  // wait the async `db.destroy()` to be called
  await setTimeout(100);
  expect(constructorStub).toBeCalledTimes(2);
  expect(destroyStub).toBeCalledTimes(1);

  // if secondary meta is changed (but another workspace)
  await storeWorkspaceMeta(appContext, v4(), {
    secondaryDBPath: path.join(tmpDir, 'secondary3.db'),
  });
  await vi.advanceTimersByTimeAsync(1500);
  expect(constructorStub).toBeCalledTimes(2);
  expect(destroyStub).toBeCalledTimes(1);

  // if primary is destroyed, secondary should also be destroyed
  await db.destroy();
  await setTimeout(100);
  expect(destroyStub).toBeCalledTimes(2);
});
