import * as os from 'node:os';
import path from 'node:path';

import { Storage } from '@affine/octobase-node';
import { app, shell } from 'electron';
import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import fs from 'fs-extra';
import { parse } from 'url';

import { getExchangeTokenParams, oauthEndpoint } from './google-auth';

const AFFINE_ROOT = path.join(os.homedir(), '.affine');

fs.ensureDirSync(AFFINE_ROOT);

const logger = console;

// todo: rethink this
export const appState = {
  storage: new Storage(path.join(AFFINE_ROOT, 'test.db')),
};

export const registerHandlers = () => {
  ipcMain.handle('octo:workspace-sync', async (_, id) => {
    return appState.storage.sync(id, '');
  });

  ipcMain.handle('ui:theme-change', async (_, theme) => {
    nativeTheme.themeSource = theme;
    logger.info('theme change', theme);
  });

  ipcMain.handle('ui:sidebar-visibility-change', async (_, visible) => {
    // todo
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
      // hide window buttons when sidebar is not visible
      w.setWindowButtonVisibility(visible);
    });
    logger.info('sidebar visibility change', visible);
  });

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
};
