import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from 'electron';
import { parse } from 'url';

import { logger } from '../../logger';
import { isMacOS } from '../../utils';
import { appContext } from './context';
import { exportDatabase } from './data/export';
import type { WorkspaceDatabase } from './data/sqlite';
import { openWorkspaceDatabase } from './data/sqlite';
import { deleteWorkspace, listWorkspaces } from './data/workspace';
import { getExchangeTokenParams, oauthEndpoint } from './google-auth';

let currentWorkspaceId = '';

const dbMapping = new Map<string, WorkspaceDatabase>();

async function ensureWorkspaceDB(id: string) {
  let workspaceDB = dbMapping.get(id);
  if (!workspaceDB) {
    // hmm... potential race condition?
    workspaceDB = await openWorkspaceDatabase(appContext, id);
    dbMapping.set(id, workspaceDB);
  }
  await workspaceDB.ready;
  return workspaceDB;
}

function registerWorkspaceHandlers() {
  ipcMain.handle('workspace:list', async _ => {
    logger.info('list workspaces');
    return listWorkspaces(appContext);
  });

  ipcMain.handle('workspace:delete', async (_, id) => {
    logger.info('delete workspace', id);
    return deleteWorkspace(appContext, id);
  });
}

function registerUIHandlers() {
  ipcMain.handle('ui:theme-change', async (_, theme) => {
    nativeTheme.themeSource = theme;
    logger.info('theme change', theme);
  });

  ipcMain.handle('ui:sidebar-visibility-change', async (_, visible) => {
    // todo
    // detect if os is macos
    if (isMacOS()) {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(w => {
        // hide window buttons when sidebar is not visible
        w.setWindowButtonVisibility(visible);
      });
      logger.info('sidebar visibility change', visible);
    }
  });

  ipcMain.handle('ui:workspace-change', async (_, workspaceId) => {
    logger.info('workspace change', workspaceId);
    currentWorkspaceId = workspaceId;
  });

  // @deprecated
  ipcMain.handle('ui:get-google-oauth-code', async () => {
    logger.info('starting google sign in ...');
    shell.openExternal(oauthEndpoint);

    return new Promise((resolve, reject) => {
      const handleOpenUrl = async (_: any, url: string) => {
        const mainWindow = BrowserWindow.getAllWindows().find(
          w => !w.isDestroyed()
        );
        const urlObj = parse(url.replace('??', '?'), true);
        if (!mainWindow || !url.startsWith('affine://auth-callback')) return;
        const code = urlObj.query['code'] as string;
        if (!code) return;

        logger.info('google sign in code received from callback', code);

        app.removeListener('open-url', handleOpenUrl);
        resolve(getExchangeTokenParams(code));
      };

      app.on('open-url', handleOpenUrl);

      setTimeout(() => {
        reject(new Error('Timed out'));
        app.removeListener('open-url', handleOpenUrl);
      }, 30000);
    });
  });

  ipcMain.handle('main:env-update', async (_, env, value) => {
    process.env[env] = value;
  });
}

function registerDBHandlers() {
  app.on('activate', () => {
    for (const [_, workspaceDB] of dbMapping) {
      workspaceDB.reconnectDB();
    }
  });

  async function getDoc(id: string): Promise<Uint8Array | null> {
    const workspaceDB = await ensureWorkspaceDB(id);
    return workspaceDB.getEncodedDocUpdates();
  }

  async function applyDocUpdate(id: string, update: Uint8Array) {
    const workspaceDB = await ensureWorkspaceDB(id);
    return workspaceDB.applyUpdate(update);
  }

  async function addBlob(workspaceId: string, key: string, data: Uint8Array) {
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.addBlob(key, data);
  }

  async function getBlob(workspaceId: string, key: string) {
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.getBlob(key);
  }

  async function deleteBlob(workspaceId: string, key: string) {
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.deleteBlob(key);
  }

  async function getPersistedBlobs(workspaceId: string) {
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.getPersistentBlobKeys();
  }

  ipcMain.handle('ui:open-db-folder', async _ => {
    const workspaceDB = await ensureWorkspaceDB(currentWorkspaceId);
    logger.log('main: open db folder', workspaceDB.path);
    shell.showItemInFolder(workspaceDB.path);
  });

  ipcMain.handle('ui:open-load-db-file-dialog', async () => {
    // todo
  });

  ipcMain.handle('ui:open-save-db-file-dialog', async () => {
    logger.log('main: open save db file dialog', currentWorkspaceId);
    const workspaceDB = await ensureWorkspaceDB(currentWorkspaceId);
    const ret = await dialog.showSaveDialog({
      properties: ['showOverwriteConfirmation'],
      title: 'Save Workspace',
      buttonLabel: 'Save',
      defaultPath: currentWorkspaceId + '.db',
      message: 'Save Workspace as SQLite Database',
    });
    const filePath = ret.filePath;
    if (ret.canceled || !filePath) {
      return null;
    }

    await exportDatabase(workspaceDB, filePath);
    shell.showItemInFolder(filePath);
    return filePath;
  });

  return {
    getDoc,
    applyDocUpdate,
    addBlob,
    getBlob,
    deleteBlob,
    getPersistedBlobs,
  };
}

export const registerHandlers = () => {
  registerWorkspaceHandlers();
  registerUIHandlers();
  return registerDBHandlers();
};
