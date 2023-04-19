import { app, shell } from 'electron';
import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { parse } from 'url';

import { isMacOS } from '../../utils';
import { appContext } from './context';
import { getExchangeTokenParams, oauthEndpoint } from './google-auth';
import type { WorkspaceDatabase } from './sqlite/db';
import { openWorkspaceDatabase } from './sqlite/db';

const logger = console;

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
  const dbMapping = new Map<string, WorkspaceDatabase>();

  async function ensureWorkspaceDB(id: string) {
    let workspaceDB = dbMapping.get(id);
    if (!workspaceDB) {
      workspaceDB = openWorkspaceDatabase(appContext, id);
      dbMapping.set(id, workspaceDB);
    }
    await workspaceDB.ready;
    return workspaceDB;
  }

  // data related
  ipcMain.handle('db:get-doc', async (_, id) => {
    console.log('main: get doc', id);
    const workspaceDB = await ensureWorkspaceDB(id);
    return workspaceDB.getEncodedDocUpdates();
  });

  ipcMain.handle('db:apply-doc-update', async (_, id, update) => {
    console.log('main: apply doc update', id);
    const workspaceDB = await ensureWorkspaceDB(id);
    return workspaceDB.applyUpdate(update);
  });

  ipcMain.handle('db:add-blob', async (_, workspaceId, key, data) => {
    console.log('main: add blob', workspaceId, key);
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.addBlob(key, data);
  });

  ipcMain.handle('db:get-blob', async (_, workspaceId, key) => {
    console.log('main: get blob', workspaceId, key);
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.getBlob(key);
  });

  ipcMain.handle('db:get-persisted-blobs', async (_, workspaceId) => {
    console.log('main: get persisted blob keys', workspaceId);
    const workspaceDB = await ensureWorkspaceDB(workspaceId);
    return workspaceDB.getPersistentBlobKeys();
  });

  ipcMain.handle('ui:open-load-db-file-dialog', async () => {
    // todo
  });

  ipcMain.handle('ui:open-save-db-file-dialog', async () => {
    // todo
  });
}

export const registerHandlers = () => {
  registerUIHandlers();
  registerDBHandlers();
};
