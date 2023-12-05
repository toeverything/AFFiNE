import {
  AppConfigStorage,
  defaultAppConfig,
} from '@toeverything/infra/app-config-storage';
import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

const FILENAME = 'config.json';
const FILEPATH = path.join(app.getPath('userData'), FILENAME);

export const persistentConfig = new AppConfigStorage({
  config: defaultAppConfig,
  get: () => JSON.parse(fs.readFileSync(FILEPATH, 'utf-8')),
  set: data => fs.writeFileSync(FILEPATH, JSON.stringify(data, null, 2)),
});

// TODO: manage handlers
ipcMain.handle('app-config-storage:get', (_, key) => persistentConfig.get(key));
ipcMain.handle('app-config-storage:set', (_, value) =>
  persistentConfig.set(value)
);
