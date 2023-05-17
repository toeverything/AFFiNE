import assert from 'node:assert';
import path from 'node:path';

import fs from 'fs-extra';
import type { Subscription } from 'rxjs';
import { v4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import type { MainIPCHandlerMap } from '../../../../constraints';

const registeredHandlers = new Map<
  string,
  ((...args: any[]) => Promise<any>)[]
>();

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

type WithoutFirstParameter<T> = T extends (_: any, ...args: infer P) => infer R
  ? (...args: P) => R
  : T;

// common mock dispatcher for ipcMain.handle AND app.on
// alternatively, we can use single parameter for T & F, eg, dispatch('workspace:list'),
// however this is too hard to be typed correctly
async function dispatch<
  T extends keyof MainIPCHandlerMap,
  F extends keyof MainIPCHandlerMap[T]
>(
  namespace: T,
  functionName: F,
  // @ts-ignore
  ...args: Parameters<WithoutFirstParameter<MainIPCHandlerMap[T][F]>>
): // @ts-ignore
ReturnType<MainIPCHandlerMap[T][F]> {
  // @ts-ignore
  const handlers = registeredHandlers.get(namespace + ':' + functionName);
  assert(handlers);

  // we only care about the first handler here
  return await handlers[0](null, ...args);
}

const SESSION_DATA_PATH = path.join(__dirname, './tmp', 'affine-test');

const browserWindow = {
  isDestroyed: () => {
    return false;
  },
  setWindowButtonVisibility: (_v: boolean) => {
    // will be stubbed later
  },
  webContents: {
    send: (_type: string, ..._args: any[]) => {
      // will be stubbed later
    },
  },
};

const ipcMain = {
  handle: (key: string, callback: (...args: any[]) => Promise<any>) => {
    const handlers = registeredHandlers.get(key) || [];
    handlers.push(callback);
    registeredHandlers.set(key, handlers);
  },
  setMaxListeners: (_n: number) => {
    // noop
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
      assert(name === 'sessionData');
      return SESSION_DATA_PATH;
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

let connectableSubscription: Subscription;

beforeEach(async () => {
  const { registerHandlers } = await import('../register');
  registerHandlers();

  // should also register events
  const { registerEvents } = await import('../../events');
  registerEvents();
  await fs.mkdirp(SESSION_DATA_PATH);
  const { database$ } = await import('../db/ensure-db');

  connectableSubscription = database$.connect();
});

afterEach(async () => {
  // reset registered handlers
  registeredHandlers.get('before-quit')?.forEach(fn => fn());

  connectableSubscription.unsubscribe();

  await fs.remove(SESSION_DATA_PATH);
});

describe('ensureSQLiteDB', () => {
  test('should create db file on connection if it does not exist', async () => {
    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);
  });

  test('when db file is removed', async () => {
    // stub webContents.send
    const sendSpy = vi.spyOn(browserWindow.webContents, 'send');
    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    let workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);

    // Can't remove file on Windows, because the sqlite is still holding the file handle
    if (process.platform === 'win32') {
      return;
    }

    await fs.remove(file);

    // wait for 2000ms for file watcher to detect file removal
    await delay(2000);

    expect(sendSpy).toBeCalledWith('db:onDBFileMissing', id);

    // ensureSQLiteDB should recreate the db file
    workspaceDB = await ensureSQLiteDB(id);
    const fileExists2 = await fs.pathExists(file);
    expect(fileExists2).toBe(true);
    sendSpy.mockRestore();
  });

  test('when db file is updated', async () => {
    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const { dbSubjects } = await import('../../events/db');
    const workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);
    const dbUpdateSpy = vi.spyOn(dbSubjects.dbFileUpdate, 'next');
    await delay(100);
    // writes some data to the db file
    await fs.appendFile(file, 'random-data', { encoding: 'binary' });
    // write again
    await fs.appendFile(file, 'random-data', { encoding: 'binary' });

    // wait for 2000ms for file watcher to detect file change
    await delay(2000);

    expect(dbUpdateSpy).toBeCalledWith(id);
    dbUpdateSpy.mockRestore();
  });
});

describe('workspace handlers', () => {
  test('list all workspace ids', async () => {
    const ids = [v4(), v4()];
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await Promise.all(ids.map(id => ensureSQLiteDB(id)));
    const list = await dispatch('workspace', 'list');
    expect(list.map(([id]) => id).sort()).toEqual(ids.sort());
  });

  test('delete workspace', async () => {
    // @TODO dispatch is hanging on Windows
    if (process.platform === 'win32') {
      return;
    }
    const ids = [v4(), v4()];
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await Promise.all(ids.map(id => ensureSQLiteDB(id)));
    await dispatch('workspace', 'delete', ids[1]);
    const list = await dispatch('workspace', 'list');
    expect(list.map(([id]) => id)).toEqual([ids[0]]);
  });
});

describe('UI handlers', () => {
  test('theme-change', async () => {
    await dispatch('ui', 'handleThemeChange', 'dark');
    expect(nativeTheme.themeSource).toBe('dark');
    await dispatch('ui', 'handleThemeChange', 'light');
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('sidebar-visibility-change (macOS)', async () => {
    vi.stubGlobal('process', { platform: 'darwin' });
    const setWindowButtonVisibility = vi.fn();
    browserWindow.setWindowButtonVisibility = setWindowButtonVisibility;
    await dispatch('ui', 'handleSidebarVisibilityChange', true);
    expect(setWindowButtonVisibility).toBeCalledWith(true);
    await dispatch('ui', 'handleSidebarVisibilityChange', false);
    expect(setWindowButtonVisibility).toBeCalledWith(false);
    vi.unstubAllGlobals();
  });

  test('sidebar-visibility-change (non-macOS)', async () => {
    vi.stubGlobal('process', { platform: 'linux' });
    const setWindowButtonVisibility = vi.fn();
    browserWindow.setWindowButtonVisibility = setWindowButtonVisibility;
    await dispatch('ui', 'handleSidebarVisibilityChange', true);
    expect(setWindowButtonVisibility).not.toBeCalled();
    vi.unstubAllGlobals();
  });
});

describe('db handlers', () => {
  test('apply doc and get doc updates', async () => {
    const workspaceId = v4();
    const bin = await dispatch('db', 'getDocAsUpdates', workspaceId);
    // ? is this a good test?
    expect(bin.every((byte: number) => byte === 0)).toBe(true);

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('test');
    ytext.insert(0, 'hello world');
    const bin2 = Y.encodeStateAsUpdate(ydoc);

    await dispatch('db', 'applyDocUpdate', workspaceId, bin2);

    const bin3 = await dispatch('db', 'getDocAsUpdates', workspaceId);
    const ydoc2 = new Y.Doc();
    Y.applyUpdate(ydoc2, bin3);
    const ytext2 = ydoc2.getText('test');
    expect(ytext2.toString()).toBe('hello world');
  });

  test('get non existent blob', async () => {
    const workspaceId = v4();
    const bin = await dispatch('db', 'getBlob', workspaceId, 'non-existent-id');
    expect(bin).toBeNull();
  });

  test('list blobs (empty)', async () => {
    const workspaceId = v4();
    const list = await dispatch('db', 'getPersistedBlobs', workspaceId);
    expect(list).toEqual([]);
  });

  test('CRUD blobs', async () => {
    const testBin = new Uint8Array([1, 2, 3, 4, 5]);
    const testBin2 = new Uint8Array([6, 7, 8, 9, 10]);
    const workspaceId = 'test-workspace-id';

    // add blob
    await dispatch('db', 'addBlob', workspaceId, 'testBin', testBin);

    // get blob
    expect(
      compareBuffer(
        await dispatch('db', 'getBlob', workspaceId, 'testBin'),
        testBin
      )
    ).toBe(true);

    // add another blob
    await dispatch('db', 'addBlob', workspaceId, 'testBin2', testBin2);
    expect(
      compareBuffer(
        await dispatch('db', 'getBlob', workspaceId, 'testBin2'),
        testBin2
      )
    ).toBe(true);

    // list blobs
    let lists = await dispatch('db', 'getPersistedBlobs', workspaceId);
    expect(lists).toHaveLength(2);
    expect(lists).toContain('testBin');
    expect(lists).toContain('testBin2');

    // delete blob
    await dispatch('db', 'deleteBlob', workspaceId, 'testBin');
    lists = await dispatch('db', 'getPersistedBlobs', workspaceId);
    expect(lists).toEqual(['testBin2']);
  });
});

describe('dialog handlers', () => {
  test('revealDBFile', async () => {
    const mockShowItemInFolder = vi.fn();
    electronModule.shell.showItemInFolder = mockShowItemInFolder;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const db = await ensureSQLiteDB(id);

    await dispatch('dialog', 'revealDBFile', id);
    expect(mockShowItemInFolder).toBeCalledWith(db.path);
  });

  test('saveDBFileAs (skipped)', async () => {
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: undefined };
    }) as any;
    const mockShowItemInFolder = vi.fn();
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;
    electronModule.shell.showItemInFolder = mockShowItemInFolder;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await ensureSQLiteDB(id);

    await dispatch('dialog', 'saveDBFileAs', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(mockShowItemInFolder).not.toBeCalled();
    electronModule.dialog = {};
    electronModule.shell = {};
  });

  test('saveDBFileAs', async () => {
    const newSavedPath = path.join(SESSION_DATA_PATH, 'saved-to');
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: newSavedPath };
    }) as any;
    const mockShowItemInFolder = vi.fn();
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;
    electronModule.shell.showItemInFolder = mockShowItemInFolder;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await ensureSQLiteDB(id);

    await dispatch('dialog', 'saveDBFileAs', id);
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

    const res = await dispatch('dialog', 'loadDBFile');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.canceled).toBe(true);
  });

  test('loadDBFile (error, in app-data)', async () => {
    const mockShowOpenDialog = vi.fn(() => {
      return {
        filePaths: [path.join(SESSION_DATA_PATH, 'workspaces')],
      };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog', 'loadDBFile');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.error).toBe('DB_FILE_PATH_INVALID');
  });

  test('loadDBFile (error, not a valid db file)', async () => {
    // create a random db file
    const basePath = path.join(SESSION_DATA_PATH, 'random-path');
    const dbPath = path.join(basePath, 'xxx.db');
    await fs.ensureDir(basePath);
    await fs.writeFile(dbPath, 'hello world');

    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: [dbPath] };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog', 'loadDBFile');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.error).toBe('DB_FILE_INVALID');

    electronModule.dialog = {};
  });

  test('loadDBFile', async () => {
    // we use ensureSQLiteDB to create a valid db file
    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const db = await ensureSQLiteDB(id);

    // copy db file to dbPath
    const basePath = path.join(SESSION_DATA_PATH, 'random-path');
    const originDBFilePath = path.join(basePath, 'xxx.db');
    await fs.ensureDir(basePath);
    await fs.copyFile(db.path, originDBFilePath);

    // on Windows, we skip this test because we can't delete the db file
    if (process.platform === 'win32') {
      return;
    }

    // remove db
    await fs.remove(db.path);

    // try load originDBFilePath
    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: [originDBFilePath] };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog', 'loadDBFile');
    expect(mockShowOpenDialog).toBeCalled();
    expect(res.workspaceId).not.toBeUndefined();

    const importedDb = await ensureSQLiteDB(res.workspaceId!);
    expect(await fs.realpath(importedDb.path)).toBe(originDBFilePath);
    expect(importedDb.path).not.toBe(originDBFilePath);

    // try load it again, will trigger error (db file already loaded)
    const res2 = await dispatch('dialog', 'loadDBFile');
    expect(res2.error).toBe('DB_FILE_ALREADY_LOADED');
  });

  test('moveDBFile', async () => {
    const newPath = path.join(SESSION_DATA_PATH, 'xxx');
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: newPath };
    }) as any;
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await ensureSQLiteDB(id);
    const res = await dispatch('dialog', 'moveDBFile', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(res.filePath).toBe(newPath);
    electronModule.dialog = {};
  });

  test('moveDBFile (skipped)', async () => {
    const mockShowSaveDialog = vi.fn(() => {
      return { filePath: null };
    }) as any;
    electronModule.dialog.showSaveDialog = mockShowSaveDialog;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await ensureSQLiteDB(id);

    const res = await dispatch('dialog', 'moveDBFile', id);
    expect(mockShowSaveDialog).toBeCalled();
    expect(res.filePath).toBe(undefined);
    electronModule.dialog = {};
  });
});
