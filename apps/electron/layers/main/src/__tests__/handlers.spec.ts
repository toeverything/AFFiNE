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

const electronModule = {
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
  shell: {} as Partial<Electron.Shell>,
  dialog: {} as Partial<Electron.Dialog>,
};

// dynamically import handlers so that we can inject local variables to mocks
vi.doMock('electron', () => {
  return electronModule;
});

beforeEach(async () => {
  // clean up tmp folder
  const { registerHandlers } = await import('../handlers');
  registerHandlers();
});

afterEach(async () => {
  const { cleanupSQLiteDBs } = await import('../data/ensure-db');
  await cleanupSQLiteDBs();
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
    // stub webContents.send
    const sendStub = vi.fn();
    browserWindow.webContents.send = sendStub;
    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    let workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);

    await fs.remove(file);

    // wait for 1000ms for file watcher to detect file removal
    await delay(2000);

    expect(sendStub).toBeCalledWith('main:on-db-file-missing', id);

    // ensureSQLiteDB should recreate the db file
    workspaceDB = await ensureSQLiteDB(id);
    const fileExists2 = await fs.pathExists(file);
    expect(fileExists2).toBe(true);
  });

  test('when db file is updated', async () => {
    // stub webContents.send
    const sendStub = vi.fn();
    browserWindow.webContents.send = sendStub;
    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    const workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);

    // wait to make sure
    await delay(500);

    // writes some data to the db file
    await fs.appendFile(file, 'random-data', { encoding: 'binary' });
    // write again
    await fs.appendFile(file, 'random-data', { encoding: 'binary' });

    // wait for 200ms for file watcher to detect file change
    await delay(2000);

    expect(sendStub).toBeCalledWith('main:on-db-file-update', id);

    // should only call once for multiple writes
    expect(sendStub).toBeCalledTimes(1);
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

describe('dialog handlers', () => {
  test('revealDBFile', async () => {
    const mockShowItemInFolder = vi.fn();
    electronModule.shell.showItemInFolder = mockShowItemInFolder;

    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    const db = await ensureSQLiteDB(id);

    await dispatch('dialog:reveal-db-file', id);
    expect(mockShowItemInFolder).toBeCalledWith(db.path);
  });

  test('saveDBFileAs (skipped)', async () => {
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: undefined };
    }) as any;
    const mockShowItemInFolder = vi.fn();
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;
    electronModule.shell.showItemInFolder = mockShowItemInFolder;

    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    await ensureSQLiteDB(id);

    await dispatch('dialog:save-db-file-as', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(mockShowItemInFolder).not.toBeCalled();
  });

  test('saveDBFileAs', async () => {
    const newSavedPath = path.join(APP_PATH, 'saved-to');
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: newSavedPath };
    }) as any;
    const mockShowItemInFolder = vi.fn();
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;
    electronModule.shell.showItemInFolder = mockShowItemInFolder;

    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    await ensureSQLiteDB(id);

    await dispatch('dialog:save-db-file-as', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(mockShowItemInFolder).toBeCalledWith(newSavedPath);

    // check if file is saved to new path
    expect(await fs.exists(newSavedPath)).toBe(true);
  });

  test('loadDBFile (skipped)', async () => {
    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: undefined };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog:load-db-file');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.canceled).toBe(true);
  });

  test('loadDBFile (error, in app-data)', async () => {
    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: [path.join(APP_PATH, 'affine-test', 'xxx')] };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog:load-db-file');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.error).toBe('db file path not valid');
  });

  test('loadDBFile (error, not a valid db file)', async () => {
    // create a random db file
    const basePath = path.join(APP_PATH, 'random-path');
    const dbPath = path.join(basePath, 'xxx.db');
    await fs.ensureDir(basePath);
    await fs.writeFile(dbPath, 'hello world');

    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: [dbPath] };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog:load-db-file');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.error).toBe('invalid db file');
  });

  test('loadDBFile', async () => {
    // we use ensureSQLiteDB to create a valid db file
    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    const db = await ensureSQLiteDB(id);

    // copy db file to dbPath
    const basePath = path.join(APP_PATH, 'random-path');
    const originDBFilePath = path.join(basePath, 'xxx.db');
    await fs.ensureDir(basePath);
    await fs.copyFile(db.path, originDBFilePath);

    // remove db
    await fs.remove(db.path);

    // try load originDBFilePath
    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: [originDBFilePath] };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog:load-db-file');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.workspaceId).not.toBeUndefined();

    const importedDb = await ensureSQLiteDB(res.workspaceId!);
    expect(await fs.realpath(importedDb.path)).toBe(originDBFilePath);
    expect(importedDb.path).not.toBe(originDBFilePath);
  });

  test('moveDBFile', async () => {
    const newPath = path.join(APP_PATH, 'affine-test', 'xxx');
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: newPath };
    }) as any;
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;

    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    const db = await ensureSQLiteDB(id);

    const res = await dispatch('dialog:move-db-file', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(res).toBe(newPath);
  });

  test('moveDBFile (skipped)', async () => {
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: null };
    }) as any;
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;

    const id = 'test-workspace-id';
    const { ensureSQLiteDB } = await import('../data/ensure-db');
    const db = await ensureSQLiteDB(id);

    const res = await dispatch('dialog:move-db-file', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(res).toBe(null);
  });
});
