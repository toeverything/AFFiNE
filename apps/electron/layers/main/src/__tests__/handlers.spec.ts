import assert from 'node:assert';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import type { MainIPCHandlerMap } from '../../../constraints';

const registeredHandlers = new Map<string, (...args: any[]) => any>();

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// common mock dispatcher for ipcMain.handle and app.on
async function dispatch<T extends keyof MainIPCHandlerMap>(
  key: T,
  ...args: Parameters<MainIPCHandlerMap[T]>
): // @ts-ignore
ReturnType<MainIPCHandlerMap[T]> {
  const handler = registeredHandlers.get(key);
  assert(handler);
  return await handler(null, ...args);
}

const APP_PATH = path.join(__dirname, './tmp');

const browserWindow = {
  isDestroyed: () => {
    return false;
  },
  setWindowButtonVisibility: (v: boolean) => {
    // will be stubbed later
  },
  webContents: {
    send: (type: string, ...args: any[]) => {
      // will be stubbed later
    },
  },
};

const ipcMain = {
  handle: (key: string, callback: (...args: any[]) => any) => {
    registeredHandlers.set(key, callback);
  },
};

const nativeTheme = {
  themeSource: 'light',
};

function compareBuffer(a: Uint8Array | null, b: Uint8Array | null) {
  if (
    (a === null && b === null) ||
    a === null ||
    b === null ||
    a.length !== b.length
  ) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

// dynamically import handlers so that we can inject local variables to mocks
vi.doMock('electron', () => {
  return {
    app: {
      getPath: (name: string) => {
        assert(name === 'appData');
        return APP_PATH;
      },
      name: 'affine-test',
      on: (name: string, callback: (...args: any[]) => any) => {
        registeredHandlers.set(name, callback);
      },
    },
    BrowserWindow: {
      getAllWindows: () => {
        return [browserWindow];
      },
    },
    nativeTheme: nativeTheme,
    ipcMain,
  };
});

beforeEach(async () => {
  // clean up tmp folder
  const { registerHandlers } = await import('../handlers');
  registerHandlers();
});

afterEach(async () => {
  const { cleanupSQLiteDBs } = await import('../data/ensure-db');
  cleanupSQLiteDBs();
  await fs.remove(APP_PATH);
});

describe('ensureSQLiteDB', () => {
  test('should create db file on connection if it does not exist', async () => {
    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    const workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);
  });

  test('when db file is removed', async () => {
    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    let workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);

    // stub webContents.send
    const sendStub = vi.fn();
    browserWindow.webContents.send = sendStub;

    await fs.remove(file);

    // wait for 500ms for file watcher to detect file removal
    await delay(500);

    expect(sendStub).toBeCalledWith('main:on-db-file-missing', id);

    // ensureSQLiteDB should recreate the db file
    workspaceDB = await ensureSQLiteDB(id);
    const fileExists2 = await fs.pathExists(file);
    expect(fileExists2).toBe(true);
  });
});

describe('workspace handlers', () => {
  test('list all workspace ids', async () => {
    const ids = ['test-workspace-id', 'test-workspace-id-2'];
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    await Promise.all(ids.map(id => ensureSQLiteDB(id)));
    const list = await dispatch('workspace:list');
    expect(list).toEqual(ids);
  });

  test('delete workspace', async () => {
    const ids = ['test-workspace-id', 'test-workspace-id-2'];
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    await Promise.all(ids.map(id => ensureSQLiteDB(id)));
    await dispatch('workspace:delete', 'test-workspace-id-2');
    const list = await dispatch('workspace:list');
    expect(list).toEqual(['test-workspace-id']);
  });
});

describe('UI handlers', () => {
  test('theme-change', async () => {
    await dispatch('ui:theme-change', 'dark');
    expect(nativeTheme.themeSource).toBe('dark');
    await dispatch('ui:theme-change', 'light');
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('sidebar-visibility-change (macOS)', async () => {
    vi.stubGlobal('process', { platform: 'darwin' });
    const setWindowButtonVisibility = vi.fn();
    browserWindow.setWindowButtonVisibility = setWindowButtonVisibility;
    await dispatch('ui:sidebar-visibility-change', true);
    expect(setWindowButtonVisibility).toBeCalledWith(true);
    await dispatch('ui:sidebar-visibility-change', false);
    expect(setWindowButtonVisibility).toBeCalledWith(false);
    vi.unstubAllGlobals();
  });

  test('sidebar-visibility-change (non-macOS)', async () => {
    vi.stubGlobal('process', { platform: 'linux' });
    const setWindowButtonVisibility = vi.fn();
    browserWindow.setWindowButtonVisibility = setWindowButtonVisibility;
    await dispatch('ui:sidebar-visibility-change', true);
    expect(setWindowButtonVisibility).not.toBeCalled();
    vi.unstubAllGlobals();
  });
});

describe('db handlers', () => {
  test('apply doc and get doc updates', async () => {
    const workspaceId = 'test-workspace-id';
    const bin = await dispatch('db:get-doc', workspaceId);
    // ? is this a good test?
    expect(bin.every((byte: number) => byte === 0)).toBe(true);

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('test');
    ytext.insert(0, 'hello world');
    const bin2 = Y.encodeStateAsUpdate(ydoc);

    await dispatch('db:apply-doc-update', workspaceId, bin2);

    const bin3 = await dispatch('db:get-doc', workspaceId);
    const ydoc2 = new Y.Doc();
    Y.applyUpdate(ydoc2, bin3);
    const ytext2 = ydoc2.getText('test');
    expect(ytext2.toString()).toBe('hello world');
  });

  test('get non existent doc', async () => {
    const workspaceId = 'test-workspace-id';
    const bin = await dispatch('db:get-blob', workspaceId, 'non-existent-id');
    expect(bin).toBeNull();
  });

  test('list blobs (empty)', async () => {
    const workspaceId = 'test-workspace-id';
    const list = await dispatch('db:get-persisted-blobs', workspaceId);
    expect(list).toEqual([]);
  });

  test('CRUD blobs', async () => {
    const testBin = new Uint8Array([1, 2, 3, 4, 5]);
    const testBin2 = new Uint8Array([6, 7, 8, 9, 10]);
    const workspaceId = 'test-workspace-id';

    // add blob
    await dispatch('db:add-blob', workspaceId, 'testBin', testBin);

    // get blob
    expect(
      compareBuffer(
        await dispatch('db:get-blob', workspaceId, 'testBin'),
        testBin
      )
    ).toBe(true);

    // add another blob
    await dispatch('db:add-blob', workspaceId, 'testBin2', testBin2);
    expect(
      compareBuffer(
        await dispatch('db:get-blob', workspaceId, 'testBin2'),
        testBin2
      )
    ).toBe(true);

    // list blobs
    let lists = await dispatch('db:get-persisted-blobs', workspaceId);
    expect(lists).toHaveLength(2);
    expect(lists).toContain('testBin');
    expect(lists).toContain('testBin2');

    // delete blob
    await dispatch('db:delete-blob', workspaceId, 'testBin');
    lists = await dispatch('db:get-persisted-blobs', workspaceId);
    expect(lists).toEqual(['testBin2']);
  });
});
