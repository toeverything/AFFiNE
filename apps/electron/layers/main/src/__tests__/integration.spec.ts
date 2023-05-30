import assert from 'node:assert';
import path from 'node:path';

import fs from 'fs-extra';
import { v4 } from 'uuid';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import type { MainIPCHandlerMap } from '../../../constraints';

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
const DOCUMENTS_PATH = path.join(__dirname, './tmp', 'affine-test-documents');

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
  const { registerHandlers } = await import('../handlers');
  registerHandlers();

  // should also register events
  const { registerEvents } = await import('../events');
  registerEvents();
  await fs.mkdirp(SESSION_DATA_PATH);
  await import('../db/ensure-db');

  registeredHandlers.get('ready')?.forEach(fn => fn());
});

afterEach(async () => {
  // reset registered handlers
  registeredHandlers.get('before-quit')?.forEach(fn => fn());

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

  test('should emit the same db instance for the same id', async () => {
    const [id1, id2] = [v4(), v4()];
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const workspaceDB1 = await ensureSQLiteDB(id1);
    const workspaceDB2 = await ensureSQLiteDB(id2);
    const workspaceDB3 = await ensureSQLiteDB(id1);
    expect(workspaceDB1).toBe(workspaceDB3);
    expect(workspaceDB1).not.toBe(workspaceDB2);
  });

  test('when app quit, db should be closed', async () => {
    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const workspaceDB = await ensureSQLiteDB(id);
    const file = workspaceDB.path;
    const fileExists = await fs.pathExists(file);
    expect(fileExists).toBe(true);
    registeredHandlers.get('before-quit')?.forEach(fn => fn());
    await delay(100);
    expect(workspaceDB.db).toBe(null);
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
    const ids = [v4(), v4()];
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const dbs = await Promise.all(ids.map(id => ensureSQLiteDB(id)));
    await dispatch('workspace', 'delete', ids[1]);
    const list = await dispatch('workspace', 'list');
    expect(list.map(([id]) => id)).toEqual([ids[0]]);
    // deleted db should be closed
    expect(dbs[1].db).toBe(null);
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
    const list = await dispatch('db', 'getBlobKeys', workspaceId);
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
    let lists = await dispatch('db', 'getBlobKeys', workspaceId);
    expect(lists).toHaveLength(2);
    expect(lists).toContain('testBin');
    expect(lists).toContain('testBin2');

    // delete blob
    await dispatch('db', 'deleteBlob', workspaceId, 'testBin');
    lists = await dispatch('db', 'getBlobKeys', workspaceId);
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

  test('loadDBFile (error, not a valid affine file)', async () => {
    // create a random db file
    const basePath = path.join(SESSION_DATA_PATH, 'random-path');
    const dbPath = path.join(basePath, 'xxx.affine');
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

  test('loadDBFile (correct)', async () => {
    // we use ensureSQLiteDB to create a valid db file
    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const db = await ensureSQLiteDB(id);

    // copy db file to dbPath
    const basePath = path.join(SESSION_DATA_PATH, 'random-path');
    const clonedDBPath = path.join(basePath, 'xxx.affine');
    await fs.ensureDir(basePath);
    await fs.copyFile(db.path, clonedDBPath);

    // delete workspace
    await dispatch('workspace', 'delete', id);

    // try load originDBFilePath
    const mockShowOpenDialog = vi.fn(() => {
      return { filePaths: [clonedDBPath] };
    }) as any;
    electronModule.dialog.showOpenDialog = mockShowOpenDialog;

    const res = await dispatch('dialog', 'loadDBFile');
    expect(mockShowOpenDialog).toBeCalled();
    const newId = res.workspaceId;

    expect(newId).not.toBeUndefined();

    assert(newId);

    const meta = await dispatch('workspace', 'getMeta', newId);

    expect(meta.secondaryDBPath).toBe(clonedDBPath);

    // try load it again, will trigger error (db file already loaded)
    const res2 = await dispatch('dialog', 'loadDBFile');
    expect(res2.error).toBe('DB_FILE_ALREADY_LOADED');
  });

  test('moveDBFile (valid)', async () => {
    const sendStub = vi.fn();
    browserWindow.webContents.send = sendStub;
    const newPath = path.join(SESSION_DATA_PATH, 'xxx');
    const showOpenDialog = vi.fn(() => {
      return { filePaths: [newPath] };
    }) as any;
    electronModule.dialog.showOpenDialog = showOpenDialog;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    const db = await ensureSQLiteDB(id);
    const res = await dispatch('dialog', 'moveDBFile', id);
    expect(showOpenDialog).toBeCalled();
    assert(res.filePath);
    expect(path.dirname(res.filePath)).toBe(newPath);
    expect(res.filePath.endsWith('.affine')).toBe(true);
    // should also send workspace meta change event
    expect(sendStub).toBeCalledWith('workspace:onMetaChange', {
      workspaceId: id,
      meta: { id, secondaryDBPath: res.filePath, mainDBPath: db.path },
    });
    electronModule.dialog = {};
    browserWindow.webContents.send = () => {};
  });

  test('moveDBFile (canceled)', async () => {
    const showOpenDialog = vi.fn(() => {
      return { filePaths: null };
    }) as any;
    electronModule.dialog.showOpenDialog = showOpenDialog;

    const id = v4();
    const { ensureSQLiteDB } = await import('../db/ensure-db');
    await ensureSQLiteDB(id);

    const res = await dispatch('dialog', 'moveDBFile', id);
    expect(showOpenDialog).toBeCalled();
    expect(res.filePath).toBe(undefined);
    electronModule.dialog = {};
  });
});

describe('applicationMenu', () => {
  // test some basic IPC events
  test('applicationMenu event', async () => {
    const { applicationMenuSubjects } = await import('../application-menu');
    const sendStub = vi.fn();
    browserWindow.webContents.send = sendStub;
    applicationMenuSubjects.newPageAction.next();
    expect(sendStub).toHaveBeenCalledWith(
      'applicationMenu:onNewPageAction',
      undefined
    );
    browserWindow.webContents.send = () => {};
  });
});
