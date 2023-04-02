import * as os from 'node:os';
import path from 'node:path';

import { Storage } from '@affine/octobase-node';
import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import fs from 'fs-extra';

const AFFINE_ROOT = path.join(os.homedir(), '.affine');

fs.ensureDirSync(AFFINE_ROOT);

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
  });

  ipcMain.handle('ui:sidebar-visibility-change', async (_, visible) => {
    // todo
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
      // hide window buttons when sidebar is not visible
      w.setWindowButtonVisibility(visible);
    });
  });
};
