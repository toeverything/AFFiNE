import { BrowserWindow, ipcMain, nativeTheme } from 'electron';

import { isMacOS } from '../../utils';
import { appContext } from './context';
import { ensureSQLiteDB } from './data/ensure-db';
import { deleteWorkspace, listWorkspaces } from './data/workspace';
import {
  loadDBFile,
  moveDBFile,
  revealDBFile,
  saveDBFileAs,
  selectDBFileLocation,
} from './dialog';
import { getGoogleOauthCode } from './google-auth';
import { logger, revealLogFile } from './logger';

type IsomorphicHandler = (
  e: Electron.IpcMainInvokeEvent,
  ...args: any[]
) => Promise<any>;

type NamespaceHandlers = {
  [key: string]: IsomorphicHandler;
};

export const workspaceHandlers = {
  list: async () => listWorkspaces(appContext),
  delete: async (_, id: string) => deleteWorkspace(appContext, id),
} satisfies NamespaceHandlers;

export const uiHandlers = {
  handleThemeChange: async (_, theme: (typeof nativeTheme)['themeSource']) => {
    nativeTheme.themeSource = theme;
  },
  handleSidebarVisibilityChange: async (_, visible: boolean) => {
    if (isMacOS()) {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(w => {
        // hide window buttons when sidebar is not visible
        w.setWindowButtonVisibility(visible);
      });
    }
  },
  getGoogleOauthCode: async () => {
    return getGoogleOauthCode();
  },
} satisfies NamespaceHandlers;

export const dbHandlers = {
  getDoc: async (_, id: string) => {
    const workspaceDB = await ensureSQLiteDB(id);
    return workspaceDB.getEncodedDocUpdates();
  },
  applyDocUpdate: async (_, id: string, update: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(id);
    return workspaceDB.applyUpdate(update);
  },
  addBlob: async (_, workspaceId: string, key: string, data: Uint8Array) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.addBlob(key, data);
  },
  getBlob: async (_, workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getBlob(key);
  },
  deleteBlob: async (_, workspaceId: string, key: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.deleteBlob(key);
  },
  getPersistedBlobs: async (_, workspaceId: string) => {
    const workspaceDB = await ensureSQLiteDB(workspaceId);
    return workspaceDB.getPersistentBlobKeys();
  },
  getDefaultStorageLocation: async () => {
    return appContext.appDataPath;
  },
} satisfies NamespaceHandlers;

export const dialogHandlers = {
  revealDBFile: async (_, workspaceId: string) => {
    return revealDBFile(workspaceId);
  },
  loadDBFile: async () => {
    return loadDBFile();
  },
  saveDBFileAs: async (_, workspaceId: string) => {
    return saveDBFileAs(workspaceId);
  },
  moveDBFile: async (_, workspaceId: string, dbFileLocation?: string) => {
    return moveDBFile(workspaceId, dbFileLocation);
  },
  revealLogFile: async () => {
    return revealLogFile();
  },
  selectDBFileLocation: async () => {
    return selectDBFileLocation();
  },
} satisfies NamespaceHandlers;

// Note: all of these handlers will be the single-source-of-truth for the apis exposed to the renderer process
export const allHandlers = {
  workspace: workspaceHandlers,
  ui: uiHandlers,
  db: dbHandlers,
  dialog: dialogHandlers,
} satisfies Record<string, NamespaceHandlers>;

export const registerHandlers = () => {
  for (const [namespace, namespaceHandlers] of Object.entries(allHandlers)) {
    for (const [key, handler] of Object.entries(namespaceHandlers)) {
      const chan = `${namespace}:${key}`;
      ipcMain.handle(chan, (e, ...args) => {
        logger.info('[ipc]', chan, ...args);
        return handler(e, ...args);
      });
    }
  }
};
