import { app } from 'electron';
import path from 'path';

export const appContext = {
  appName: app.name,
  appDataPath: path.join(app.getPath('appData'), app.name),
};

export type AppContext = typeof appContext;
