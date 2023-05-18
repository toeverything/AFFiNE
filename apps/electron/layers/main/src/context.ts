import { app } from 'electron';

export const appContext = {
  get appName() {
    return app.name;
  },
  get appDataPath() {
    return app.getPath('sessionData');
  },
};

export type AppContext = typeof appContext;
