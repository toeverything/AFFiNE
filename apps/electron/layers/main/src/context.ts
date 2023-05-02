import { app } from 'electron';
import path from 'path';

export const appContext = {
  get appName() {
    return app.name;
  },
  get appDataPath() {
    return path.join(app.getPath('appData'), app.name);
  },
};

export type AppContext = typeof appContext;
