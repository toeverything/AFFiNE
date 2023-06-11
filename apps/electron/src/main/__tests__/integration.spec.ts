import assert from 'node:assert';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { MainIPCHandlerMap } from '../exposed';

const registeredHandlers = new Map<
  string,
  ((...args: any[]) => Promise<any>)[]
>();

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
  ...args: Parameters<WithoutFirstParameter<MainIPCHandlerMap[T][F]>>
): // @ts-expect-error
ReturnType<MainIPCHandlerMap[T][F]> {
  // @ts-expect-error
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

  registeredHandlers.get('ready')?.forEach(fn => fn());
});

afterEach(async () => {
  // reset registered handlers
  registeredHandlers.get('before-quit')?.forEach(fn => fn());
  // wait for the db to be closed on Windows
  if (process.platform === 'win32') {
    await setTimeout(200);
  }
  await fs.remove(SESSION_DATA_PATH);
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
