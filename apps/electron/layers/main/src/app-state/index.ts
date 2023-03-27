import * as os from 'node:os';
import path from 'node:path';

import { Storage } from '@affine/octobase-node';
import { ipcMain } from 'electron';
import fs from 'fs-extra';

const AFFINE_ROOT = path.join(os.homedir(), '.affine');

fs.ensureDirSync(AFFINE_ROOT);

// todo: rethink this
export const appState = {
  storage: new Storage(path.join(AFFINE_ROOT, 'test.db')),
};

export const registerHandlers = () => {
  ipcMain.handle('workspaceSync', async (_, id) => {
    return appState.storage.sync(id, '');
  });
};
