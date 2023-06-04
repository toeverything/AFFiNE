import { app } from 'electron';

export const appContext = {
  get appName() {
    if (app) {
      return app.name;
    }
    return process.env.AFFINE_NAME!;
  },
  get appDataPath() {
    if (app) {
      return app.getPath('sessionData');
    }
    return process.env.AFFINE_APP_DATA_PATH!;
  },
};

export type AppContext = typeof appContext;
