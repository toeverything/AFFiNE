import path from 'node:path';

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
    addEventListener: (...args: any[]) => {
      // @ts-ignore
      electronModule.app.on(...args);
    },
    removeEventListener: () => {},
  },
  shell: {} as Partial<Electron.Shell>,
  dialog: {} as Partial<Electron.Dialog>,
};

const runHandler = (key: string) => {
  registeredHandlers.get(key)?.forEach(handler => handler());
};

// dynamically import handlers so that we can inject local variables to mocks
vi.doMock('electron', () => {
  return electronModule;
});

const constructorStub = vi.fn();
const destroyStub = vi.fn();

vi.doMock('../secondary-db', () => {
  return {
    SecondaryWorkspaceSQLiteDB: class {
      constructor(...args: any[]) {
        constructorStub(...args);
      }

      destroy = destroyStub;
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(async () => {
  runHandler('before-quit');
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

  runHandler('before-quit');

  expect(db0.db).toBeNull();
  expect(db1.db).toBeNull();
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

  await vi.advanceTimersByTimeAsync(1500);

  // not sure why but we still need to wait with real timer
  await new Promise(resolve => setTimeout(resolve, 100));

  expect(constructorStub).toBeCalledTimes(1);
  expect(constructorStub).toBeCalledWith(path.join(tmpDir, 'secondary.db'), db);

  // if secondary meta is changed
  await storeWorkspaceMeta(appContext, workspaceId, {
    secondaryDBPath: path.join(tmpDir, 'secondary2.db'),
  });

  await vi.advanceTimersByTimeAsync(1500);
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
  db.destroy();
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(destroyStub).toBeCalledTimes(2);
});
